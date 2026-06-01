import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { ageToken } from './functions/age-token/resource';

const backend = defineBackend({
  ageToken,
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
