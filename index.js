'use strict';

const fs = require('fs');
const chokidar = require('chokidar');
const nfile = require('nami-utils').file;
const minimatch = require('minimatch');
const config = JSON.parse(fs.readFileSync(nfile.join(__dirname, 'config.json')));
const exec = require('child_process').exec;
const execSync = require('child_process').execSync;
const _ = require('lodash');
const filesBeingTransfered = [];
const filesToTransfer = [];
const filesToIgnore = config.ignore || [];
const projects = {};
setInterval(function() {
  _.each(nfile.glob(nfile.join(config.localDir, '*')), f => projects[f] = 0);
}, 10000);

function addToList(file) {
  if (!_.includes(filesToTransfer, file)) {
    filesToTransfer.push(file);
  }
}

function removeFromList(file, options) {
  options = _.defaults(options || {}, {all: false});
  if (_.includes(filesToTransfer, file)) {
    _.pull(filesToTransfer, file);
  }
}

function sync(localDir, remoteDir, host, port, user) {
  let rsyncCommand = `rsync -r -e "ssh -o Port=${port}"`;
  if (!_.isEmpty(filesToIgnore)) {
    _.each(filesToIgnore, f => {
      rsyncCommand += ` --exclude ${nfile.join('**', f)}`;
    });
  }
  rsyncCommand += ` ${nfile.join(localDir, '*')} ${user}@${host}:${remoteDir}`;
  exec(rsyncCommand, (error) => {
    if (error) {
      console.log(`Failed to sync:`, error);
    } else {
      console.log('Sync finished');
    }
  });
}

function scp(file, remotePath, host, port, user) {
  if (!_.includes(filesBeingTransfered, file)) {
    filesBeingTransfered.push(file);
    let remoteExists = false;
    try {
      execSync(`ssh -o Port=${port} ${user}@${host} 'ls ${remotePath}' > /dev/null 2>&1`);
      remoteExists = true;
    } catch (e) { /* not empty */ }
    let orig = nfile.join(config.localDir, file);
    try {
      if (remoteExists && fs.statSync(nfile.join(config.localDir, file)).isDirectory()) {
        orig = `${orig}/*`;
      }
      console.log(`Transfering ${file}`);
      exec(`scp -r -o Port=${port} ${orig} ${user}@${host}:${remotePath}`,
        (error) => {
          _.pull(filesBeingTransfered, file);
          if (error) {
            if (error.message.match('No such file or directory') || error.message.match('Permission denied')) {
              console.log(`File ${file} no longer exists or it is not writable`);
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
    } catch (e) {
      // File doesn't exists now
    }
  }
}

function remoteRemove(file, host, port, user) {
  console.log(`Deleting ${file}`);
  exec(`ssh -o Port=${port} ${user}@${host} 'rm -r ${file}'`, () => {});
}

function deleteFile(filePath) {
  const filename = filePath.replace(`${config.localDir}/`, '');
  remoteRemove(nfile.join(config.remoteDir, filename),
               config.host, config.port, config.user);
}

function syncFile(filePath) {
  const filename = filePath.replace(`${config.localDir}/`, '');
  if (_.every(filesToIgnore, (f) => !minimatch(filename, f))) {
    scp(filename,
      nfile.join(config.remoteDir, filename),
      config.host, config.port, config.user
    );
  }
}

console.log('Scanning directories to watch on', config.localDir);
function registerWatcher() {
  let res = chokidar.watch(config.localDir, {recursive: true, encoding: 'buffer'});
  let active = false;
  const evalSync = (path) => {
    if (active) {
      // Avoid crashes from excesive files transfer
      const projectName = nfile.relativize(path, config.localDir).split('/')[0];
      const projectPath = nfile.join(config.localDir, projectName);
      if (_.isUndefined(projects[projectPath])) projects[projectPath] = 0;
      projects[projectPath]++;
      if (projects[projectPath] === 10) {
        console.log('High usage detected, syncing the whole project ', projectName);
        res.close();
        sync(nfile.join(config.localDir, projectName), nfile.join(config.remoteDir, projectName),
        config.host, config.port, config.user);
        active = false;
        res = registerWatcher();
      } else if (projects[projectPath] < 10) {
        syncFile(path);
      }
    }
  };
  res
  .on('add', evalSync)
  .on('addDir', evalSync)
  .on('change', evalSync)
  .on('unlink', deleteFile)
  .on('unlinkDir', deleteFile)
  .on('ready', () => {
    active = true;
  });
}
console.log('Runing first sync');
sync(config.localDir, config.remoteDir,
     config.host, config.port, config.user);
registerWatcher();

setInterval(function() {
  if (!_.isEmpty(filesToTransfer)) {
    console.log('Checking files to transfer:');
    console.log(filesToTransfer);
    _.each(filesToTransfer, file => {
      scp(file,
           nfile.join(config.remoteDir, file),
           config.host, config.port, config.user);
    });
  }
}, 30000);

setInterval(function() {
  console.log('Re-synchying directories');
  sync(config.localDir, config.remoteDir,
       config.host, config.port, config.user);
}, 1800000);
