'use strict';

const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json')));
const exec = require('child_process').exec;
const toTransferFile = path.join(__dirname, 'to-transfer.json');
const ignoreFile = path.join(__dirname, '.ignore');
const _ = require('lodash');
const filesBeingTransfered = [];
let syncInProgress = false;
let filesToTransfer = [];
let filesToIgnore = [];
try {
  filesToTransfer = JSON.parse(fs.readFileSync(toTransferFile, 'utf8'));
} catch (e) {/* not empty */}

try {
  filesToIgnore = _.compact(fs.readFileSync(ignoreFile, 'utf8').split('\n'));
} catch(e) {/* not empty */}

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
    exec(`scp -r -o Port=${port} ${path.join(config.localDir, file)} ${user}@${host}:${remotePath}`,
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
    exec(`rsync -rv -e "ssh -o Port=${port}" ${path.join(config.localDir, '*')} ${user}@${host}:${remoteDir}`,
         (error, stdout, stderr) => {
           syncInProgress = false;
           if (error) {
             console.log(`Failed to sync`);
           }
           console.log(stdout);
           console.log(stderr);
         });
  }
}

function remoteRemove(file, host, port, user) {
  exec(`ssh -o Port=${port} ${user}@${host} 'rm -r ${file}'`,
       (error) => {
         console.log(error);
       });
}

fs.watch(config.localDir, {recursive: true, encoding: 'buffer'}, (event,filename) => {
  if (event === 'rename') {
    fs.access(path.join(config.localDir, filename), fs.F_OK, (err) => {
      if(err) {
        // File removed, deleting remotely
        remoteRemove(path.join(config.remoteDir, filename),
                     config.host, config.port, config.user);
      } else {
        if (_.every(filesToIgnore, (f) => !filename.match(f))) {
          if (syncInProgress) {
            addToList(filename);
          } else {
            scp(filename,
                path.join(config.remoteDir, filename),
                config.host, config.port, config.user);
          }
        }
      }
    });
  }
});

setInterval(function() {
  console.log('Checking files to transfer:');
  console.log(filesToTransfer);
  if (!_.isEmpty(filesToTransfer) && !syncInProgress) {
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


