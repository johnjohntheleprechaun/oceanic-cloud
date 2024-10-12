#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {OceanicCloudStack, OceanicStackProps} from './oceanic-cloud-stack';
import {existsSync, readFileSync} from 'fs';
import {writeFile} from 'fs/promises';
const parser = require("swagger-parser");

(async () => {
    let config: OceanicStackProps;
    if (existsSync("config.json")) {
        const configFile = readFileSync("config.json");
        config = JSON.parse(configFile.toString());
        config.isProd = true;
    } else {
        throw new Error("no config file");
    }

    // bundle the API definition
    const bundled = await parser.bundle("src/api/definition.yml");
    await writeFile("src/api/definition.bundle.json", JSON.stringify(bundled));

    console.log(config);

    const app = new cdk.App();
    new OceanicCloudStack(app, "OceanicProd", config);
    const testProps: OceanicStackProps = {
        isProd: false,
        oAuthCallbacks: ["http://localhost:8080/callback.html"],
        logoutUrls: ["http://localhost:8080/"]
    }
    new OceanicCloudStack(app, "OceanicTest", testProps);
})();
