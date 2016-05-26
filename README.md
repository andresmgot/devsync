# devsync
# Install
`npm install`

# Sync files with dockerdev
Watch for changes in projects folder and sync

## Usage
`node index.js`

## Configure
config.json
```
{
  "localDir": "/path/to/projects",
  "remoteDir": "/remote/path/to/projects",
  "host": "1.2.3.4",
  "user": "user",
  "port": "22",
  "key": "~/.ssh/id_rsa"
}
```

## Something went wrong, synchronize
```
rsync -rv -e "ssh -o Port=22" /path/to/projects/* user@1.2.3.4:/remote/path/to/projects
```
