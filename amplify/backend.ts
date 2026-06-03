import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { ageToken } from './functions/age-token/resource';
import { ageProxy } from './functions/age-proxy/resource';

const backend = defineBackend({
  auth,
  data,
  ageToken,
  ageProxy,
});

// Req 6: GetSecretValue on the specific secret ARN only. Nothing else.
backend.ageToken.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['secretsmanager:GetSecretValue'],
    resources: [
      'arn:aws:secretsmanager:us-west-2:433306266182:secret:lifeline-dashboard/age-service-account-xsaNsS',
    ],
  }),
);

// ── AGE proxy wiring ──
// Inject the values the proxy can't know at definition time.
backend.ageProxy.addEnvironment(
  'AGE_TOKEN_FUNCTION_NAME',
  backend.ageToken.resources.lambda.functionName,
);
backend.ageProxy.addEnvironment(
  'AGE_TOKEN_REGION',
  backend.ageToken.resources.lambda.stack.region,
);
backend.ageProxy.addEnvironment(
  'USER_POOL_ID',
  backend.auth.resources.userPool.userPoolId,
);
backend.ageProxy.addEnvironment(
  'USER_POOL_CLIENT_ID',
  backend.auth.resources.userPoolClient.userPoolClientId,
);

// Proxy invokes the token broker (never reads the secret itself).
backend.ageToken.resources.lambda.grantInvoke(backend.ageProxy.resources.lambda);

// Public Function URL; auth is enforced inside the handler (Cognito JWT verify).
const proxyUrl = backend.ageProxy.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    // The ArcGIS JS API sends portal requests with credentials mode 'include',
    // so origins must be explicit (not '*') and allowCredentials must be true.
    // Add the deployed app origin here when wiring Amplify Hosting.
    allowedOrigins: ['http://localhost:5173'],
    allowedHeaders: ['authorization', 'content-type', 'x-esri-authorization'],
    allowedMethods: [HttpMethod.GET, HttpMethod.POST],
    allowCredentials: true,
  },
});

// Surfaced to the frontend via amplify_outputs.json -> custom.ageProxyUrl.
backend.addOutput({ custom: { ageProxyUrl: proxyUrl.url } });
