import {readdirSync, writeFileSync} from "fs";
import {readdir, stat} from "fs/promises";
import {compileFromFile} from "json-schema-to-typescript";
import path, {join, relative} from "path";

compileFromFile("src/api/schemas/document-create.json", {cwd: "src/api/schemas", additionalProperties: false, })
    .then(ts => writeFileSync("test.d.ts", ts));

// traverse the schema file tree
async function traverseDirectory(dir: string, base?: string, outPaths: string[] = []) {
    const baseDir = base ? base : dir;
    const entries = await readdir(dir);
    for (const entry of entries) {
        const entryStat = await stat(join(dir, entry));
        if (entryStat.isDirectory()) {
            await traverseDirectory(join(dir, entry), baseDir, outPaths);
        }
        else {
            outPaths.push(relative(baseDir, join(dir, entry)));
        }
    };

    return outPaths;
}

traverseDirectory("src/api/schemas")
    .then(a => console.log((a)));
