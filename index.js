const Queue = require('./queue');
const fs = require('fs');

const threads = 4; // number of parallel downloads
const stallTime = 120000;   // check for x miliseconds before concluding that the download has failed

// main function to be executed
let main = async () => {
    try {
        let links = await linksArray(); // fetch all links from text file
        links = removeUnwantedLinks(links); // clean unwanted links
        let queue = new Queue(links.length > threads ? threads : links.length, links, stallTime);   // create a queue to download those files
        
        queue.startDownload();  // start download process
        
        // on process completed
        queue.queueEvent.on('finished', () => {
            console.log('Process Completed');
        });
    }
    catch(err) {
        console.log('Error : ', err);
    }
};

// get the links in the form of an array
let linksArray = () => {
    return new Promise((resolve, reject) => {
        fs.readFile('links.txt', (err, data) => {
            if(!err) {
                resolve(data.toString().split('\n'));
            }
        });
    });
};

// clean unwanted links
let removeUnwantedLinks = function(links) {
    let output = [];
    for(let index in links) {
        if(links[index]) {
            output.push(links[index]);
        } 
    }
    return output;
};

main();