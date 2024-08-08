import {FileInfo, dereference} from "@apidevtools/json-schema-ref-parser";
import {existsSync} from "fs";
import {mkdir, readFile, readdir, stat, writeFile} from "fs/promises";
import {compile, compileFromFile} from "json-schema-to-typescript";
import {join, parse, relative} from "path";

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

// do thing to the thing to make the things or something
(async () => {
    const relativePaths = await traverseDirectory("src/api/schemas");

    // create the output directories if they don't exist already
    if (!existsSync("src/api/schema-types")) {
        await mkdir("src/api/schema-types");
    }
    if (!existsSync("src/api/compiled-schemas")) {
        await mkdir("src/api/compiled-schemas");
    }

    for (const path of relativePaths) {
        const realPath = join("src/api/schemas", path);

        // compile the paths
        const compiled = JSON.stringify(await dereference(realPath));
        await writeFile(join("src/api/compiled-schemas", path), compiled)

        // write the new files
        const ts = await compileFromFile(join("src/api/compiled-schemas", path), {additionalProperties: false});
        await writeFile(join("src/api/schema-types", parse(path).name + ".d.ts"), ts);
    }
})();
