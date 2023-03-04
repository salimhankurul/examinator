#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway'
import { Duration } from 'aws-cdk-lib'
import { Function, Architecture, Runtime, Code } from 'aws-cdk-lib/aws-lambda'
import { AttributeType, BillingMode, StreamViewType, Table } from 'aws-cdk-lib/aws-dynamodb'
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam'
import { DomainName, HttpApi, HttpMethod, HttpRoute, HttpRouteKey, PayloadFormatVersion } from '@aws-cdk/aws-apigatewayv2-alpha'
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha'
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager'

export class XorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const UserTable = new Table(this, 'UserTable', {
      partitionKey: {
        name: 'email',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
      tableName: 'UserTable',
    })

    const TokenTable = new Table(this, 'TokenTable', {
      partitionKey: {
        name: 'userId',
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_IMAGE,
      timeToLiveAttribute: 'expiresAt',
      tableName: 'TokenTable',
    })

    const role = new Role(this, 'COSLambdaRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    })

    if (role) {
      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['ec2:*'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['dynamodb:*'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['logs:*'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.DENY,
          resources: ['*'],
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['events:*'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['lambda:*'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['s3:*'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['cloudwatch:*'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['sns:*'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['sts:*'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['secretsmanager:GetSecretValue'],
          conditions: {
            StringEquals: {
              'secretsmanager:ResourceTag/ServiceName': 'COSService',
            },
          },
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['kinesis:*'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['states:*'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['iam:*'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          resources: ['*'],
          actions: ['cloudfront:*'],
        }),
      )

      role.addToPolicy(
        new PolicyStatement({
          effect: Effect.DENY,
          resources: ['*'],
          actions: ['iam:CreateServiceLinkedRole'],
        }),
      )
    }

    const testLambda = new Function(this, 'testLambda', {
      runtime: Runtime.NODEJS_16_X, // So we can use async in widget.js
      code: Code.fromAsset('dist'),
      handler: 'index.test',
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(5),
      role,
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
      }
    })

    const loginLambda = new Function(this, 'loginLambda', {
      runtime: Runtime.NODEJS_16_X, // So we can use async in widget.js
      code: Code.fromAsset('dist'),
      handler: 'auth.login',
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(5),
      role,
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
        REFRESH_TOKEN_SECRET: 'REFRESH_TOKEN_SECRET',
      }
    })

    const registerLambda = new Function(this, 'registerLambda', {
      runtime: Runtime.NODEJS_16_X, // So we can use async in widget.js
      code: Code.fromAsset('dist'),
      handler: 'auth.register',
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(5),
      role,
      environment: {
        ACCESS_TOKEN_SECRET: 'ACCESS_TOKEN_SECRET',
        REFRESH_TOKEN_SECRET: 'REFRESH_TOKEN_SECRET',
      }
    })

    const refreshLambda = new Function(this, 'refreshLambda', {
      runtime: Runtime.NODEJS_16_X, // So we can use async in widget.js
      code: Code.fromAsset('dist'),
      handler: 'auth.refreshToken',
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(5),
      role,
      environment: {
        REFRESH_TOKEN_SECRET: 'REFRESH_TOKEN_SECRET',
      }
    })

    const httpApi = new HttpApi(this, 'COSServiceHttpAPI', {
      description: 'Cloud Objects service Http Api',
      createDefaultStage: true,
    })

    new HttpRoute(this, 'XorAPIRouteLogin' + HttpMethod.POST, {
      httpApi,
      routeKey: HttpRouteKey.with('/LOGIN', HttpMethod.POST),
      integration: new HttpLambdaIntegration('loginLambdanegration', loginLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'XorAPIRouteRegister' + HttpMethod.POST, {
      httpApi,
      routeKey: HttpRouteKey.with('/REGISTER', HttpMethod.POST),
      integration: new HttpLambdaIntegration('registerLambdaInegration', registerLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'XorAPIRouteRefresh' + HttpMethod.POST, {
      httpApi,
      routeKey: HttpRouteKey.with('/REFRESH', HttpMethod.POST),
      integration: new HttpLambdaIntegration('refreshLambdaInegration', refreshLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

    new HttpRoute(this, 'XorAPIRouteTest' + HttpMethod.POST, {
      httpApi,
      routeKey: HttpRouteKey.with('/TEST', HttpMethod.POST),
      integration: new HttpLambdaIntegration('testLambdaInegration', testLambda, {
        payloadFormatVersion: PayloadFormatVersion.custom('2.0'),
      }),
    })

  }
}

const app = new cdk.App()
new XorStack(app, 'XorStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */
  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },
  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
})
app.synth()
