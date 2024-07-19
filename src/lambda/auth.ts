import { APIGatewayProxyHandler } from 'aws-lambda';
import { getSignedCookies } from '@aws-sdk/cloudfront-signer';
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({ region: process.env.AWS_REGION });

const distributionDomain = process.env.DISTRIBUTION_DOMAIN!;
const keyPairId = process.env.KEY_PAIR_ID!;

const getPrivateKey = async (): Promise<string> => {
    const ssmParam = async (key: string): Promise<string> => {
        return (await ssm.send(new GetParameterCommand({ Name: key, WithDecryption: true }))).Parameter?.Value!
    }
    return await ssmParam('/viiteapitest/cloudfront/key/priv')
};

/*
const getSignedCookies = (privateKey: string, expires: number) => {
    const policy = JSON.stringify({
        Statement: [
            {
                Resource: `https://${distributionDomain}/*`,
                Condition: {
                    DateLessThan: {
                        'AWS:EpochTime': expires
                    }
                }
            }
        ]
    });

    const signedCookies = getSignedUrl({
        keyPairId,
        privateKey,
        policy
    });
    return signedCookies;
};
*/
export const handler: APIGatewayProxyHandler = async (event:any) => {
    console.log(event)
    try {
        const expires = Math.floor(Date.now() / 1000) + (60/*min*/ * 60 /*sec*/)
        const policy = JSON.stringify({
            Statement: [
                {
                    Resource: `https://${distributionDomain}/*`,
                    Condition: {
                        DateLessThan: {
                            'AWS:EpochTime': expires
                        }
                    }
                }
            ]
        });
        const privateKey = await getPrivateKey();
        const signedCookies = getSignedCookies({
            keyPairId,
            policy,
            privateKey,
        });
        console.log(JSON.stringify(signedCookies, 2, null))
        return {
            statusCode: 200,
            headers: {
                'Set-Cookie': [
                    `CloudFront-Policy=${signedCookies['CloudFront-Policy']}; Domain=${distributionDomain}; Path=/; Secure; HttpOnly`,
                    `CloudFront-Signature=${signedCookies['CloudFront-Signature']}; Domain=${distributionDomain}; Path=/; Secure; HttpOnly`,
                    `CloudFront-Key-Pair-Id=${signedCookies['CloudFront-Key-Pair-Id']}; Domain=${distributionDomain}; Path=/; Secure; HttpOnly`,
                ].join(', ')
            },
            body: JSON.stringify({
                message: 'Signed cookies set'
            })
        };
    } catch (error:any) {
        console.error('Error generating signed cookies:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to generate signed cookies',
                error: error.message
            })
        };
    }
};
