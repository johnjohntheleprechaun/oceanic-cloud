import {DocumentCreate} from "../schema-types/document-create"

const request: DocumentCreate = {
    type: "messages-journal",
    documentKey: ""
};
const url = process.argv[process.argv.length - 2] + "/users/me/documents";
const token = process.argv[process.argv.length - 1];
console.log(token);
fetch(url, {
    method: "POST",
    body: JSON.stringify(request),
    headers: {
        "Authorization": token,
    },
})
    .then(resp => resp.json())
    .then(json => console.log(json, "JSON RESP"));
