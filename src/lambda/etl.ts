import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, ListObjectsV2CommandInput, ListObjectsV2CommandOutput, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { CodePipelineClient, PutJobSuccessResultCommand, PutJobFailureResultCommand } from "@aws-sdk/client-codepipeline"; // Import AWS SDK v3 clients
import { APIGatewayProxyEvent, Context, APIGatewayProxyResult } from "aws-lambda"; // Import types for Lambda functions
import { PromisePool } from '@supercharge/promise-pool';

const s3Client = new S3Client({});

const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const isDateString = (dateString: string): boolean => isoDateRegex.test(dateString);
const listDateDirectories = async (): Promise<string[]> => {
    const dateDirectories: string[] = [];
    let continuationToken: string | undefined;
  
    do {
      const params: ListObjectsV2CommandInput = {
        Bucket: process.env.BUCKET,
        Prefix: '', // Adjust prefix based on bucket structure if needed
        Delimiter: '/',
        ContinuationToken: continuationToken,
      };
  
      const command = new ListObjectsV2Command(params);
      const response = await s3Client.send(command) as ListObjectsV2CommandOutput;
  
      if (response.CommonPrefixes) {
        dateDirectories.push(...response.CommonPrefixes.filter(cp => isDateString(cp.Prefix ?? '')).map(cp => cp.Prefix as string));
      }
  
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
  
    return dateDirectories;
  }

export const s3get = async (Bucket:string, Key:string) => {
    console.log('s3get', Key)
    const data = await s3Client.send(new GetObjectCommand({ Bucket, Key }))
    const str = await data.Body?.transformToString() ?? ''
    return JSON.parse(str)
}

export const s3put = async (Bucket:string, Key:string, jsonData:any) => await s3Client.send(
    new PutObjectCommand({ Bucket, Key, Body: JSON.stringify(jsonData)}))  

const readData = async () => {
    const dirs = await listDateDirectories()
    const data:any = {}
    await PromisePool
        .withConcurrency(100)
        .for(dirs)
        .process(async (dir) => {
            console.log(`Processing directory: ${dir}`);

            const dev = await s3get(process.env.BUCKET!, `${dir}results-dev.json`)
            const qa = await s3get(process.env.BUCKET!, `${dir}results-qa.json`)
            const prod = await s3get(process.env.BUCKET!, `${dir}results-prod.json`)

            const tests = (obj:any) => obj[0].summary.totalAssertions + obj[0].summary.passedTests
            data[dir] = {
                dev: tests(dev),
                qa: tests(qa),
                prod: tests(prod)
            }
        });
    console.log('all done')
    await s3put(process.env.BUCKET!, 'summary.json', data)
}

export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  const codePipelineClient = new CodePipelineClient({});
  const jobId = event['CodePipeline.job'].id;

  try {
    // Log the event for debugging purposes
    console.log('Received event:', JSON.stringify(event, null, 2));

    await readData()

    // Notify CodePipeline of successful job completion
    const putJobSuccessCommand = new PutJobSuccessResultCommand({ jobId });
    await codePipelineClient.send(putJobSuccessCommand);

    return {
      statusCode: 200,
      body: JSON.stringify('Job Succeeded'),
    };
  } catch (error) {
    console.error('Job Failed:', error);

    // Notify CodePipeline of job failure
    const putJobFailureCommand = new PutJobFailureResultCommand({
      jobId,
      failureDetails: {
        message: JSON.stringify(error),
        type: 'JobFailed', // Modify based on error type
      },
    });

    await codePipelineClient.send(putJobFailureCommand);

    return {
      statusCode: 500,
      body: JSON.stringify('Job Failed'),
    };
  }
};

