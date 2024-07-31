const AWS = require('aws-sdk');
const codepipeline = new AWS.CodePipeline();

export const putJobSuccess = async (jobId:any, message:string) => {
  await codepipeline.putJobSuccessResult({
      jobId: jobId
  }).promise();
  return message;
};

export const putJobFailure = async (jobId:any, message:string) => {
  await codepipeline.putJobFailureResult({
      jobId: jobId,
      failureDetails: {
          message: JSON.stringify(message),
          type: 'JobFailed',
      }
  }).promise();
  return message;
};
