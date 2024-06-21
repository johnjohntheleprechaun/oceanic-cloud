import * as cdk from 'aws-cdk-lib';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import path = require('path');
import { OceanicUsers } from './constructs/users';
import { OceanicStorage } from './constructs/storage';
import { OceanicApi } from './constructs/api';
import { KeyGroup, PublicKey } from 'aws-cdk-lib/aws-cloudfront';
import { readFileSync } from 'fs';

export const lambdaDefaults = {
    runtime: Runtime.NODEJS_20_X,
    architecture: Architecture.ARM_64,
    directory: path.join(__dirname, "functions")
}

export interface OceanicStackProps extends cdk.StackProps {
    isProd: boolean
    domainName?: string
    certArn?: string
    oAuthCallbacks: string[]
    logoutUrls: string[]
}
export class OceanicCloudStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: OceanicStackProps) {
        super(scope, id, props);

        // Storage resources
        const storage = new OceanicStorage(this, "oceanic-storage", {
            isProd: props.isProd
        })

        // User pool definition
        const cognito = new OceanicUsers(this, "oceanic-users", {
            isProd: props.isProd,
            callbackUrls: props.oAuthCallbacks,
            logoutUrls: props.logoutUrls,
        });

        const api = new OceanicApi(this, "oceanic-api", {
            isProd: props.isProd,
            cognito,
            storage,
            domainName: props.domainName,
            certArn: props.certArn
        });
    }
}
