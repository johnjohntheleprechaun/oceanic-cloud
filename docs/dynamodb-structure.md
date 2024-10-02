# DynamoDB Table Spec Overview

This is a summary of how the DynamoDB table is structured

## Key Structure

How keys (partition and sort) are formatted

### Partition Key

The partition key is formatted as

`{dataType}:{userId}`

`dataType` is a pluralised (if applicable) description of the data stored in this partition (`documents`, `keys`, etc).

`userId` is the UUID of the user that controls this data.

### Sort Key

Since most data doesn't ever actually need to be sorted, this is just the ID of whatever data. (specifics are listed elsewhere).

For data that does need to be sorted (such as listing documents by time of last edit), a Local Secondary Index that contains the bare minimum amount of data needed (i.e. title, last edit, and document id).

## Local Secondary Indexes

Specifications for each LSI used. To avoid any accidentaln merging of separate datatypes, dynamodb property names should be globally unique (i.e. `documentTitle` instead of `title`). In general, these will be mapped to non-unique names before being returned to the user (`documentTitle` -> `title`).

### Last Update

Forward `documentTitle`, `documentKey`, and `documentUpdated`

### Creation Date

Forward the `documentTitle`, `documentKey`, and `documentCreated`
