#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OceanicCloudStack } from '../lib/oceanic-cloud-stack';
import {  existsSync, readFileSync } from 'fs';

let config = {
    prodProps: {
        isProd: true
    },
    testProps: {
        isProd: false
    }
};
if (existsSync("config.json")) {
    const configFile = readFileSync("config.json");
    config = JSON.parse(configFile.toString());
}

console.log(config);

const app = new cdk.App();
const prodProps = config.prodProps;
prodProps.isProd = true;
new OceanicCloudStack(app, "OceanicProd", prodProps);
const testProps = config.testProps;
testProps.isProd = false;
new OceanicCloudStack(app, "OceanicTest", testProps);