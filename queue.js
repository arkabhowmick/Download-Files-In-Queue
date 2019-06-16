const events = require('events');
const fs = require('fs');
const request = require('request');

class Queue {

    constructor(queueLength, list, checkTime) {

        this.queueLength = queueLength ? queueLength : 1;   // queue length
        this.list = list;   // list of links
        this.lastIndex = 0; // keep track of last index
        this.completedCount = 0;    // total number of files downloaded
        
        this.queueEvent = new events.EventEmitter();    // create an event emitter
        this.downloadedSize = {};  // store the size of file for checking if download has stalled 
        this.checkTime = checkTime; // stall time check duration

        // on download
        this.queueEvent.on('download', async (index) => {

            let url = this.list[index];
            let filename = 'downloads/' + url.split('/')[url.split('/').length - 1];
            console.log(`Downloading ${url}...`);

            this.downloadedSize[index] = 0;

            let obj = {
                interval : null,    // store the interval i.e. set interval
                readStream : null,  // store the readstream
                filename : filename,
                index : index
            };

            /**
             * create a race condition 
             * i.e. either the file will be completely downloaded
             * or compare the file size after a specific time. if the downloaded file size is still same after the stall time,
             * download will be stopped
             **/
            let result = await Promise.race([this.download(obj), this.checkFile(obj)]);

            if(!result) {   // if download failed
                obj.readStream.abort(); // close the read stream
                await this.deleteFile(obj.filename);
                await this.appendFile('logs/errors.txt', list[index]);
            }
            else {  // if download completed
                await this.appendFile('logs/completed.txt', list[index]);
            }

            clearInterval(obj.interval);    // clear interval

            this.queueEvent.emit('completed', index);   // emit completed event
        });

        this.queueEvent.on('completed', async (index) => {

            console.log('Completed '+ this.list[index]);
            this.completedCount+= 1;    // increase completed count
            if(this.lastIndex < this.list.length - 1) { // if all files are not downloaded 
                this.queueEvent.emit('download', this.lastIndex+1); // download next item
                this.lastIndex = this.lastIndex + 1;
            }
            else if(this.completedCount >= this.list.length){   // if all files are downloaded
                this.queueEvent.emit('finished', '');
            }

        });
    }

    deleteFile(filename) {  // delete file
        return new Promise((resolve, reject) => {
            fs.unlink(filename, (err) => {
                if(err) {
                    console.log(err);
                }
                resolve();
            });
        });
    }

    checkFile(obj) {    // check if file size is same after the interval
        return new Promise((resolve, reject) => {
            obj.interval = setInterval(() => {
                let filesize = this.getFileSize(obj.filename);
                if(this.downloadedSize[obj.index] == filesize) {
                    resolve(false);
                }
                else {
                    this.downloadedSize[obj.index] = filesize;
                }
            }, this.checkTime); // check every x duration
        });
    }

    getFileSize(filename) { // get the file size in mb
        var stats = fs.statSync(filename);
        var fileSizeInMb = stats["size"] / 1000000;
        return fileSizeInMb;
    }

    // function to download file
    async download(obj) {
        return new Promise((resolve) => {
            try {
                obj.readStream = request(this.list[obj.index]);
                let ws = fs.createWriteStream(obj.filename);
                let stream = obj.readStream.pipe(ws);
                
                obj.readStream.on('error', () => {
                    resolve(false);
                });

                stream.on('finish', () => {
                    resolve(true);
                }).on('error', () => {
                    resolve(false);
                });
            }
            catch(err) {
                console.log('Error : ', err);
                resolve(false);
            }
        });
    }

    // start downloading files by filling up the queue
    startDownload() {
        for(let i = 0; i < this.queueLength; i++) {
            if(this.list.length > i) {
                this.queueEvent.emit('download', i);
                this.lastIndex = i;
            }
        }
    }

    // function to append file
    appendFile(filename, data) {
        return new Promise((resolve, reject) => {
            fs.appendFile(filename, data + '\n', () => {
                resolve('done');
            });
        });
    }
}

module.exports = Queue;