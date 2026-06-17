import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda';
import { CfnUserPoolDomain } from 'aws-cdk-lib/aws-cognito';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { ageToken } from './functions/age-token/resource';
import { ageProxy } from './functions/age-proxy/resource';
import { listUsers } from './functions/list-users/resource';

const backend = defineBackend({
  auth,
  data,
  ageToken,
  ageProxy,
  listUsers,
});

// ── Okta SSO: pin the Cognito Hosted-UI domain prefix ──
// defineAuth auto-creates ONE UserPoolDomain when externalProviders is set but
// gives it a generated prefix and exposes no way to set it (domainPrefix is
// Omit'd from the factory props, and the domain isn't in cfnResources). So find
// the generated CfnUserPoolDomain in the tree and override its prefix.
// Prefix is GLOBALLY unique + this is shared code, so derive per env:
//   prod (main)   -> 'dcgis-eoc'      (registered in Okta)
//   local sandbox -> 'dcgis-eoc-dev'  (registered in Okta; AWS_BRANCH unset)
//   any preview   -> 'dcgis-eoc-<branch>' (unique, avoids colliding with the
//                    sandbox/other previews; NOT registered in Okta, so only
//                    native login works on previews — Okta is tested on prod).
//   https://<prefix>.auth.us-west-2.amazoncognito.com/oauth2/idpresponse
const branch = process.env.AWS_BRANCH;
const hostedUiPrefix = !branch
  ? 'dcgis-eoc-dev'
  : branch === 'main'
    ? 'dcgis-eoc'
    : `dcgis-eoc-${branch
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)}`;
const cfnUserPoolDomain = backend.auth.resources.userPool.node
  .findAll()
  .find((c): c is CfnUserPoolDomain => c instanceof CfnUserPoolDomain);
if (!cfnUserPoolDomain) {
  throw new Error('Okta: could not find the generated CfnUserPoolDomain to set its prefix');
}
cfnUserPoolDomain.domain = hostedUiPrefix;

// ── list-users (Admin assignment UI) ──
// Needs the pool id at runtime + permission to enumerate it.
backend.listUsers.addEnvironment(
  'USER_POOL_ID',
  backend.auth.resources.userPool.userPoolId,
);
backend.listUsers.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['cognito-idp:ListUsers'],
    resources: [backend.auth.resources.userPool.userPoolArn],
  }),
);

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
    // Each Amplify branch deploys its own backend (own proxy), so list every
    // frontend origin that should reach the proxy: the production custom domain,
    // the Amplify branch subdomains (https://<branch '/'->'-'>.<appId>.amplifyapp.com),
    // and localhost for dev.
    allowedOrigins: [
      'https://eoc.dogis.org',
      'http://localhost:5173',
      'https://main.d3qicauq9rd01b.amplifyapp.com',
      'https://feature-admin-settings.d3qicauq9rd01b.amplifyapp.com',
    ],
    allowedHeaders: ['authorization', 'content-type', 'x-esri-authorization'],
    allowedMethods: [HttpMethod.GET, HttpMethod.POST],
    allowCredentials: true,
  },
});

// Surfaced to the frontend via amplify_outputs.json -> custom.ageProxyUrl.
backend.addOutput({ custom: { ageProxyUrl: proxyUrl.url } });
