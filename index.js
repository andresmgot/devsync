'use strict';

const fs = require('fs');
const chokidar = require('chokidar');
const minimatch = require('minimatch');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json')));
const exec = require('child_process').exec;
const execSync = require('child_process').execSync;
const toTransferFile = path.join(__dirname, 'to-transfer.json');
const _ = require('lodash');
const filesBeingTransfered = [];
let syncInProgress = false;
let filesToTransfer = [];
let filesToIgnore = config.ignore || [];
try {
  filesToTransfer = JSON.parse(fs.readFileSync(toTransferFile, 'utf8'));
} catch (e) {/* not empty */}

function addToList(file) {
  if(!_.includes(filesToTransfer, file)) {
    filesToTransfer.push(file);
    fs.writeFileSync(toTransferFile, filesToTransfer);
  }
}

function removeFromList(file, options) {
  options = _.defaults(options || {}, {all: false});
  if(_.includes(filesToTransfer, file)) {
    _.pull(filesToTransfer, file);
    fs.writeFileSync(toTransferFile, filesToTransfer);
  }
}

function scp(file, remotePath, host, port, user){
  if (!_.includes(filesBeingTransfered, file)) {
    filesBeingTransfered.push(file);
    let remoteExists = false;
    try {
      execSync(`ssh -o Port=${port} ${user}@${host} 'ls ${remotePath}' > /dev/null 2>&1`);
      remoteExists = true;
    } catch (e) {}
    let orig = path.join(config.localDir, file);
    if(remoteExists && fs.statSync(path.join(config.localDir, file)).isDirectory()) {
      orig = orig + '/*';
    }
    console.log(`Transfering ${file}`);
    exec(`scp -r -o Port=${port} ${orig} ${user}@${host}:${remotePath}`,
         (error, stdout, stderr) => {
           _.pull(filesBeingTransfered, file);
           if (error) {
             if (error.message.match('No such file or directory') || error.message.match('Permission denied')) {
               console.log(`File ${file} no longer exists or it is not modificable`);
               removeFromList(file);
             } else {
               console.log('Failed to transfer, saving for later:', error.message);
               addToList(file);
             }
             return;
           } else {
             console.log('File transfered');
             removeFromList(file);
           }
         });
  }
}

function sync(localDir, remoteDir, host, port, user){
  if (!syncInProgress) {
    syncInProgress = true;
    let rsyncCommand = `rsync -r -e "ssh -o Port=${port}"`;
    if(!_.isEmpty(filesToIgnore)) {
      _.each(filesToIgnore, f => {
        rsyncCommand += ` --exclude ${path.join('**', f)}`;
      })
    }
    rsyncCommand += ` ${path.join(config.localDir, '*')} ${user}@${host}:${remoteDir}`;
    exec(rsyncCommand, (error, stdout, stderr) => {
           syncInProgress = false;
           if (error) {
             console.log(`Failed to sync:`, error);
           } else {
             console.log('Sync finished');
           }
         });
  }
}

function remoteRemove(file, host, port, user) {
  console.log(`Deleting ${file}`);
  exec(`ssh -o Port=${port} ${user}@${host} 'rm -r ${file}'`, (error) => {});
}

function deleteFile(filePath) {
  const filename = filePath.replace(`${config.localDir}/`, '');
  remoteRemove(path.join(config.remoteDir, filename),
               config.host, config.port, config.user);
}

let active = false;
function syncFile(filePath) {
  const filename = filePath.replace(`${config.localDir}/`, '');
  let deleted = false;
  if(active) {
    if (_.every(filesToIgnore, (f) => !minimatch(filename, f))) {
      if (syncInProgress) {
        addToList(filename);
      } else {
        scp(filename,
          path.join(config.remoteDir, filename),
          config.host, config.port, config.user
        );
      }
    }
  }
}

console.log('Scanning directories to watch on', config.localDir);
chokidar.watch(config.localDir, {recursive: true, encoding: 'buffer'})
  .on('add', syncFile)
  .on('addDir', syncFile)
  .on('change', syncFile)
  .on('unlink', deleteFile)
  .on('unlinkDir', deleteFile)
  .on('ready', () => {
    active = true;
    console.log('Initial scan complete. Runing first sync');
    sync(config.localDir, config.remoteDir,
         config.host, config.port, config.user);
  });

setInterval(function() {
  if (!_.isEmpty(filesToTransfer) && !syncInProgress) {
    console.log('Checking files to transfer:');
    console.log(filesToTransfer);
    _.each(filesToTransfer, file => {
      scp(file,
           path.join(config.remoteDir, file),
           config.host, config.port, config.user);
    });
  }
}, 30000);

setInterval(function() {
  console.log('Re-synchying directories');
  sync(config.localDir, config.remoteDir,
       config.host, config.port, config.user);
}, 600000);
