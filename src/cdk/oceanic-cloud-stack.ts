import * as cdk from 'aws-cdk-lib';
import { TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import path = require('path');
import { OceanicUserPool } from './constructs/user-pool';
import { OceanicStorage } from './constructs/storage';
import { OceanicApi } from './constructs/rest-api';
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
        const storage = new OceanicStorage(this, "oceanic-bucket", {
            isProd: props.isProd
        })

        // User pool definition
        const cognito = new OceanicUserPool(this, "oceanic-users", {
            isProd: props.isProd,
            callbackUrls: props.oAuthCallbacks,
            logoutUrls: props.logoutUrls,
            dynamoTable: storage.table,
            s3Bucket: storage.bucket
        });

        const api = new OceanicApi(this, "oceanic-api", {
            isProd: props.isProd,
            cognito,
            documents: storage,
            database: storage.table,
            domainName: props.domainName,
            certArn: props.certArn
        });
    }
}
