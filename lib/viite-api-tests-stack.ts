import { CfnDynamicReference, CfnDynamicReferenceService, Duration, RemovalPolicy, SecretValue, Stack, StackProps } from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { AllowedMethods, CacheCookieBehavior, CacheHeaderBehavior, CachePolicy, CacheQueryStringBehavior, Distribution, KeyGroup, LambdaEdgeEventType, OriginAccessIdentity, OriginRequestPolicy, PriceClass, PublicKey, SecurityPolicyProtocol, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3Origin } from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import { BuildSpec, ComputeType, LinuxBuildImage, Project } from 'aws-cdk-lib/aws-codebuild';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { CodeBuildAction, GitHubSourceAction, LambdaInvokeAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { Peer, Port, SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { ApplicationLoadBalancer, ApplicationTargetGroup, ListenerAction, TargetType } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { LambdaTarget } from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { CodePipeline } from 'aws-cdk-lib/aws-events-targets';
import { CanonicalUserPrincipal, ManagedPolicy, PolicyDocument, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Code, Function, FunctionUrlAuthType, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { BlockPublicAccess, Bucket, CfnBucketPolicy, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class ViiteApiTestsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Test results
    const dataBucket = !true ? new Bucket(this, 'S3BucketForTestResults', {
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      bucketName: `finnishtransportagency-viite-api-tests`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
    })
    : Bucket.fromBucketAttributes(this, 'S3BucketForTestResults', {
      bucketName: 'finnishtransportagency-viite-api-tests'
    })
    const dataOAI = new OriginAccessIdentity(this, 'dataOAI', {
      comment: `Allows CloudFront access to S3 data bucket`,
    });
    /**
     * WARNING! If the bucket exists no policy statement is added (you need to add by hand)
     * cdk bug https://github.com/aws/aws-cdk/issues/6548
     */
    dataBucket.grantRead(dataOAI)
    const policyStatement = new PolicyStatement();
    policyStatement.addActions('s3:GetBucket*');
    policyStatement.addActions('s3:GetObject*');
    policyStatement.addActions('s3:List*');
    policyStatement.addResources(dataBucket.bucketArn);
    policyStatement.addResources(`${dataBucket.bucketArn}/*`);
    policyStatement.addCanonicalUserPrincipal(dataOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId);
    new CfnBucketPolicy(this, 'cloudfrontAccessBucketPolicy', {
      bucket: dataBucket.bucketName,
      policyDocument: new PolicyDocument({
        statements: [
          policyStatement
        ]
      })
    })


    // SPA static content (from github /dist/ directory)
    const websiteBucket = new Bucket(this, 'S3BucketForWebsiteContent', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      bucketName: `finnishtransportagency-viite-api-tests-frontend`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
    });
    const cloudfrontOAI = new OriginAccessIdentity(this, 'cloudfrontOAI', {
      comment: `Allows CloudFront access to S3 bucket`,
    });
    websiteBucket.grantRead(cloudfrontOAI)

    // Cloudfront distribution
    // Huom jos cloudfront distron joutuu luomaan cdk:lla uusiksi (=tekee tarpeeksi rajuja muutoksia),
    // niin consolessa pitää käydä ensin poistamassa vanhasta distrosta alternate domain namet, jolloin uuden luonti onnistuu
    //
    // certificate is located in us-east-1
    const cert = Certificate.fromCertificateArn(this, 'ac',
      'arn:aws:acm:us-east-1:783354560127:certificate/d2c9d643-0571-4833-ae00-2da45431a9ea'
    )
    const cdn = new Distribution(this, 'MyDistribution', {
        comment: 'CDN for Viite API test results',
        defaultRootObject: 'index.html',

        domainNames: ['viiteapitest.testivaylapilvi.fi'],
        certificate: cert,
        //webAclId: wafArn,
        minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021, // oli TLS_V1_1_2016
        priceClass: PriceClass.PRICE_CLASS_100,
        //logBucket: logBucket,
        logIncludesCookies: true,
        errorResponses: [
            {
                // 404 on otettu kiinni jotta saadaan cloudfrontin s3 bucketti toimimaan.
                httpStatus: 404,
                responseHttpStatus: 200,
                ttl: Duration.minutes(10),
                responsePagePath: '/index.html',
            },
        ],
        defaultBehavior: {
            origin: new S3Origin(websiteBucket, {
                originAccessIdentity: cloudfrontOAI,
            }),
            viewerProtocolPolicy:
                ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            compress: true,
            //responseHeadersPolicy: frontEndHeaderPolicy,
            allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        },
    });

    const noCachePolicy = new CachePolicy(this, 'OriginRequestPolicy', {
        cachePolicyName: 'no-cache',
        comment: 'Dont cache, forward to data',
        cookieBehavior: CacheCookieBehavior.all(),
        headerBehavior: CacheHeaderBehavior.allowList(
            'Authorization',
            'Accept-Encoding'
        ),
        queryStringBehavior: CacheQueryStringBehavior.all(),
        defaultTtl: Duration.millis(0),
    });

    // Generate a CloudFront key pair
    const publicKey = new PublicKey(this, 'MyPublicKey', {
      encodedKey: StringParameter.fromStringParameterName(this, 'pubkey', '/viiteapitest/cloudfront/key/pub').stringValue,
    });    
    const keyGroup = new KeyGroup(this, 'MyKeyGroup', {
      items: [publicKey],
    });
    cdn.addBehavior('/data/*', new S3Origin(dataBucket, { originAccessIdentity: dataOAI }), {
      allowedMethods: AllowedMethods.ALLOW_ALL,
      cachePolicy: noCachePolicy,
      compress: true,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      //responseHeadersPolicy: apiHeaderPolicy,
      originRequestPolicy: OriginRequestPolicy.CORS_S3_ORIGIN,
      trustedKeyGroups: [ keyGroup ],
    });
    // datetime directories
    cdn.addBehavior('/202*/*', new S3Origin(dataBucket, { originAccessIdentity: dataOAI }), {
      allowedMethods: AllowedMethods.ALLOW_ALL,
      cachePolicy: noCachePolicy,
      compress: true,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      //responseHeadersPolicy: apiHeaderPolicy,
      originRequestPolicy: OriginRequestPolicy.CORS_S3_ORIGIN,
      trustedKeyGroups: [ keyGroup ],
    });

    cdn.addBehavior('/oauth2/*', new HttpOrigin('viiteapitest-proxy.testivaylapilvi.fi'), {
      allowedMethods: AllowedMethods.ALLOW_ALL,
      cachePolicy: noCachePolicy,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      //responseHeadersPolicy: apiHeaderPolicy,
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER,
    });


    const devkey = StringParameter.fromSecureStringParameterAttributes(this, 'devapikey', {
      parameterName: '/dev/viite/apiGateway',
    })
    const qakey = StringParameter.fromSecureStringParameterAttributes(this, 'qaapikey', {
      parameterName: '/qa/viite/apiGateway',
    })
    const prodkey = StringParameter.fromSecureStringParameterAttributes(this, 'prodapikey', {
      parameterName: '/prod/viite/apiGateway',
    })

    // ETL Lambda
    const etlLambda = new NodejsFunction(this, 'etllambda', {
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(900),
      memorySize: 2*1024,
      //code: Code.fromAsset('src'), // The output from `tsc`
      entry: './src/lambda/etl.ts',
      handler: 'handler',
      bundling: {
        minify: true,
      },
      environment: {
        BUCKET: dataBucket.bucketName
      }
    })
    dataBucket.grantReadWrite(etlLambda)

    const etlDailyLambda = new NodejsFunction(this, 'etldailylambda', {
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(900),
      memorySize: 3*256,
      //code: Code.fromAsset('src'), // The output from `tsc`
      entry: './src/lambda/etl-daily.ts',
      handler: 'handler',
      bundling: {
        minify: true,
      },
      environment: {
        BUCKET: dataBucket.bucketName
      }
    })
    dataBucket.grantReadWrite(etlDailyLambda)

    // create build project
    const runTests = new Project(this,'buildProject',{
      environment: {
        buildImage: LinuxBuildImage.STANDARD_7_0,
        computeType: ComputeType.SMALL,
      },
      buildSpec:  BuildSpec.fromObject({
        version: '0.2',

        phases: {
          install: {
            commands: [
              'node --version',
              'npm --version',
              'npm install',
            ]
          },
          build: {
            commands: [
              'npx bru --version',
              'npx cdk deploy --all --exclusive --require-approval never',
              `export TARGET=\`date -u +"%Y-%m-%dT%H:%M:%SZ"\``,
              `export DEVKEY=\`aws ssm get-parameter --name '/dev/viite/apiGateway' --with-decryption | jq -r .Parameter.Value\``,
              `export QAKEY=\`aws ssm get-parameter --name '/qa/viite/apiGateway' --with-decryption | jq -r .Parameter.Value\``,
              `export PRODKEY=\`aws ssm get-parameter --name '/prod/viite/apiGateway' --with-decryption | jq -r .Parameter.Value\``,
              `BASE='https://devapi.testivaylapilvi.fi/viite' APIKEY=$DEVKEY npx bru run --env dev --output results-dev.json || true`,
              `BASE='https://api.testivaylapilvi.fi/viite' APIKEY=$QAKEY npx bru run --env dev --output results-qa.json || true`,
              `BASE='https://api.vaylapilvi.fi/viite' APIKEY=$PRODKEY npx bru run --env dev --output results-prod.json || true`,
              `aws s3 cp results-dev.json s3://${dataBucket.bucketName}/$TARGET/`,
              `aws s3 cp results-qa.json s3://${dataBucket.bucketName}/$TARGET/`,
              `aws s3 cp results-prod.json s3://${dataBucket.bucketName}/$TARGET/`,
              `aws s3 cp ./dist s3://${websiteBucket.bucketName}/ --recursive`,
              `aws cloudfront create-invalidation --distribution-id E2ION4DK2QI6VQ --paths /index.html /css/styles.css /css/vayla.css `
            ],
          },
        },
      })
    });
    devkey.grantRead(runTests.role!)
    qakey.grantRead(runTests.role!)
    prodkey.grantRead(runTests.role!)
    runTests.role?.addManagedPolicy(ManagedPolicy.fromManagedPolicyArn(this,'cfPolicy','arn:aws:iam::aws:policy/AdministratorAccess'))
    dataBucket.grantReadWrite(runTests.role!)
    cdn.grantCreateInvalidation(runTests.role!)

    // Create dev-pipeline and add stages
    const pipeline = new Pipeline(this, `ApiTestPipeline`, {
      pipelineName: `viite-api-tests`
    });

    const sourceOutput = new Artifact();

    pipeline.addStage({
      stageName: 'Sources',
      actions: [
        new GitHubSourceAction({
          output: sourceOutput,
          owner: 'finnishtransportagency',
          repo: 'viite-api-tests',
          branch: 'master',
          actionName: 'GithubSource',
          oauthToken: Secret.fromSecretAttributes(this, 'GitHubToken', {
            secretCompleteArn: 'arn:aws:secretsmanager:eu-west-1:783354560127:secret:github/oauth/token-mRI6v3'
          }).secretValue,
        }),
      ]
    })
    pipeline.addStage({
      stageName: 'RunTests',
      actions: [
        new CodeBuildAction({
          actionName: 'RunTests',
          project: runTests,
          input: sourceOutput,
          environmentVariables: {
            ENV: {value: 'dev'},
            //ENVIRONMENT: {value: environment},
            //TARGET_ACCOUNT: {value: account},
          },
        })
      ]
    })
    pipeline.addStage({
      stageName: 'ETLProcess1',
      actions: [
        new LambdaInvokeAction({
          actionName: 'RunETL1',
          lambda: etlDailyLambda,
        })
      ]
    })
    pipeline.addStage({
      stageName: 'ETLProcess2',
      actions: [
        new LambdaInvokeAction({
          actionName: 'RunETL2',
          lambda: etlLambda,
        })
      ]
    })
  
    const auth = new NodejsFunction(this, 'AuthenticationBackrouteProxy', {
      runtime: Runtime.NODEJS_20_X,
      timeout: Duration.seconds(30),
      entry: './src/lambda/auth.ts',
      handler: 'handler',
      bundling: {
        minify: true,
      },
      environment: {
        DOMAIN: 'viiteapitest.testivaylapilvi.fi',
        DISTRIBUTION_DOMAIN: cdn.distributionDomainName,
        KEY_PAIR_ID: publicKey.publicKeyId,
      }
    });
    StringParameter.fromSecureStringParameterAttributes(this, 'privkey', {
      parameterName: '/viiteapitest/cloudfront/key/priv'
    }).grantRead(auth)

    // Function url is not working with väylä network so let's build up alb and target 80 port to lambda
    const vpcId = 'vpc-017797e470d94956b' //''.valueFromLookup(this, `${ENV}.vpc`);
    const vpc = Vpc.fromLookup(this, 'vpc', {
      vpcId,
      isDefault: false
    })

    // SG Sallii pääsyn ALB:lle internetistä
    const albSg = new SecurityGroup(this, 'sg', {
      vpc,
      allowAllOutbound: true,
      description: 'security group for alb',
    })
    albSg.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(80),
      'allow HTTP traffic from anywhere',
    );

    // Create ALB
    const lb = new ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: false,
      securityGroup: albSg,

    })

    let targetGrp;
    const listener = lb.addListener('Listener', { port: 80 });
    listener.addAction('Default', {
      //priority: 100, //default priority
      //conditions: [],
      action: ListenerAction.forward([targetGrp = new ApplicationTargetGroup(this, `AppTargetGrp`, {

          targetType: TargetType.LAMBDA,
          targets: [new LambdaTarget(auth)],

        })
      ])
    })
    targetGrp.setAttribute('lambda.multi_value_headers.enabled', 'true')




    const eventRule = new Rule(this, 'nightlyTestRun', {
      schedule: Schedule.cron({ hour: '4', minute: '0' }),
    });
    eventRule.addTarget(new CodePipeline(pipeline));

  
  }
}
