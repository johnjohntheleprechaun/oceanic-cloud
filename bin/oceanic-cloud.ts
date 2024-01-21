#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OceanicCloudStack } from '../lib/oceanic-cloud-stack';

const app = new cdk.App();
new OceanicCloudStack(app, "OceanicProd");
new OceanicCloudStack(app, "OceanicTest");