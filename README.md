# devsync
# Install
`npm install`

# Sync files with dockerdev
Watch for changes in projects folder and sync

## Usage
`npm start`

## Configure
config.json:
```json
{
  "localDir": "/path/to/projects",
  "remoteDir": "/remote/path/to/projects",
  "host": "1.2.3.4",
  "user": "user",
  "port": "22",
  "key": "~/.ssh/id_rsa",
  "ignore": "*log"
}
```
