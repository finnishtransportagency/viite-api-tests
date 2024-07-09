import { CfnDynamicReference, CfnDynamicReferenceService, RemovalPolicy, SecretValue, Stack, StackProps } from 'aws-cdk-lib';
import { BuildSpec, ComputeType, LinuxBuildImage, Project } from 'aws-cdk-lib/aws-codebuild';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { CodeBuildAction, GitHubSourceAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { CodePipeline } from 'aws-cdk-lib/aws-events-targets';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class ViiteApiTestsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = !true ? new Bucket(this, 'S3BucketForTestResults', {
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      bucketName: `finnishtransportagency-viite-api-tests`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
    })
    : Bucket.fromBucketAttributes(this, 'S3BucketForTestResults', {
      bucketName: 'finnishtransportagency-viite-api-tests'
    })

    const devkey = StringParameter.fromSecureStringParameterAttributes(this, 'devapikey', {
      parameterName: '/dev/viite/apiGateway',
    })
    const qakey = StringParameter.fromSecureStringParameterAttributes(this, 'qaapikey', {
      parameterName: '/qa/viite/apiGateway',
    })
    const prodkey = StringParameter.fromSecureStringParameterAttributes(this, 'prodapikey', {
      parameterName: '/prod/viite/apiGateway',
    })


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
              `export DEVKEY=\`aws ssm get-parameter --name '/dev/viite/apiGateway' --with-decryption | jq -r .Parameter.Value\``,
              `export QAKEY=\`aws ssm get-parameter --name '/qa/viite/apiGateway' --with-decryption | jq -r .Parameter.Value\``,
              `export PRODKEY=\`aws ssm get-parameter --name '/prod/viite/apiGateway' --with-decryption | jq -r .Parameter.Value\``,
              `BASE='https://devapi.testivaylapilvi.fi/viite' APIKEY=$DEVKEY bru run --env dev --output results-dev.json`,
              `BASE='https://api.testivaylapilvi.fi/viite' APIKEY=$QAKEY bru run --env dev --output results-qa.json`,
              `BASE='https://api.vaylapilvi.fi/viite' APIKEY=$PRODKEY bru run --env dev --output results-prod.json`,
              `aws s3 cp result-*.json s3://${bucket.bucketName}/\`date --iso-8601=seconds\`/`
          ],
          },
        },
      })
    });
    devkey.grantRead(runTests.role!)
    qakey.grantRead(runTests.role!)
    prodkey.grantRead(runTests.role!)
    runTests.role?.addManagedPolicy(ManagedPolicy.fromManagedPolicyArn(this,'cfPolicy','arn:aws:iam::aws:policy/AdministratorAccess'))
    bucket.grantReadWrite(runTests.role!)

    // Create dev-pipeline and add stages
    const pipeline = new Pipeline(this, `ApiTestPipeline`, {
      pipelineName: `viite-api-tests`
    });
    console.log(Secret.fromSecretAttributes(this, 'GitHubToken222', {
      secretCompleteArn: 'arn:aws:secretsmanager:eu-west-1:783354560127:secret:github/oauth/token-mRI6v3'
    }).secretValue.unsafeUnwrap())

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
    });
  

    const eventRule = new Rule(this, 'nightlyTestRun', {
      schedule: Schedule.cron({ hour: '4', minute: '0' }),
    });
    eventRule.addTarget(new CodePipeline(pipeline));

  
  }
}
