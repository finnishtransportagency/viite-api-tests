import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { BlockPublicAccess, Bucket, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class ViiteApiTestsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bucket = new Bucket(this, 'S3BucketForTestResults', {
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      bucketName: `finnishtransportagency-viite-api-tests`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
    });

    const eventRule = new Rule(this, 'nightlyTestRun', {
      schedule: Schedule.cron({ hour: '4', minute: '0' }),
    });
    //eventRule.addTarget(new LambdaFunction(koodistot));
  }
}
