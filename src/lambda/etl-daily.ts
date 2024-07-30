import { CodePipelineClient, PutJobSuccessResultCommand, PutJobFailureResultCommand } from "@aws-sdk/client-codepipeline"; // Import AWS SDK v3 clients
import { APIGatewayProxyEvent, Context, APIGatewayProxyResult } from "aws-lambda"; // Import types for Lambda functions
import { PromisePool } from '@supercharge/promise-pool';
import { listDateDirectories, s3get, s3has, s3put } from './s3';

const readData = async () => {
    const dirs = await listDateDirectories(process.env.BUCKET!)
    const data:any = {}
    await PromisePool
        .withConcurrency(30)
        .for(dirs)
        .process(async (dir) => {
            console.log(`Processing directory: ${dir}`);

            const key = `data/${dir}daily.json`
            if (!(await s3has(process.env.BUCKET!, key))) {
              const dev = await s3get(process.env.BUCKET!, `${dir}results-dev.json`)
              const qa = await s3get(process.env.BUCKET!, `${dir}results-qa.json`)
              const prod = await s3get(process.env.BUCKET!, `${dir}results-prod.json`)
  
              const dailyData = (obj:any) => {
                const o = obj[0]
                const data = {
                  date: dir.replace(/\//, ''),
                  passed: o.summary.totalAssertions + o.summary.passedTests,
                  total: o.summary.totalTests,
                  tests: o.results.map((x:any) => ({
                    test: `${x.request.method} ${x.request.url}`,
                    status: (x.assertionResults.concat(x.testResults)).some((s: { status: string; }) => s.status == 'fail') ? 'fail': 'pass',
                    responseTime: o.response.responseTime,
                  }))
                }
              }
  
              try {
                data[dir] = {
                    dev: dailyData(dev),
                    qa: dailyData(qa),
                    prod: dailyData(prod)
                }
                await s3put(process.env.BUCKET!, key, data)
              } catch (err) {
                console.log(err)
              }
            }
        });
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

