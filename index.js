'use strict';

const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json')));
const exec = require('child_process').exec;
const toTransferFile = path.join(__dirname, 'to-transfer.json');
const _ = require('lodash');
const filesBeingTransfered = [];
let filesToTransfer = [];
try {
  const _files = JSON.parse(fs.readFileSync(toTransferFile));
  filesToTransfer = _files;
} catch(e) { /* not empty */ }


function addToList(file) {
  if(!_.includes(filesToTransfer, file)) {
    filesToTransfer.push(file);
    fs.writeFileSync(toTransferFile, filesToTransfer);
  }
}

function removeFromList(file) {
  if(_.includes(filesToTransfer, file)) { 
    _.pull(filesToTransfer, file);
    fs.writeFileSync(toTransferFile, filesToTransfer);
  }
}

function sync(file, remotePath, host, port, user){
  if (!_.includes(filesBeingTransfered, file)) {
    filesBeingTransfered.push(file);
    exec(`scp -o Port=${port} ${path.join(config.localDir, file)} ${user}@${host}:${remotePath}`,
         (error, stdout, stderr) => {
           _.pull(filesBeingTransfered, file); 
           if (error) {
             if (error.message.match('No such file or directory')) {
               console.log(`File ${file} no longer exists`);
             } else {
               console.log('Failed to transfer, saving for later');
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

fs.watch(config.localDir, {recursive: true, encoding: 'buffer'}, (event,filename) => {
  if (filename && !filename.match('#') && !filename.match(/.*~/)) {
    sync(filename,
         path.join(config.remoteDir, filename),
         config.host, config.port, config.user);
  }
});

setInterval(function() {
  console.log('Checking files to transfer:');
  console.log(filesToTransfer);
  if (!_.isEmpty(filesToTransfer)) {
    _.each(filesToTransfer, file => {
      sync(file,
           path.join(config.remoteDir, file),
           config.host, config.port, config.user);
    });
  }
}, 30000);


