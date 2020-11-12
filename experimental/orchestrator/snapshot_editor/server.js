/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const ut = require('util')
const router = express.Router();
const app = express();
const path = require('path');
const farmhash = require('farmhash');
const fs = require('fs');
const util = require('@microsoft/bf-orchestrator/lib/utility');
const resolver = require('@microsoft/bf-orchestrator/lib/labelresolver');
const helper = require('@microsoft/bf-orchestrator/lib/orchestratorhelper');

// Globals 
// BUGBUG: These need to be put into a session.
var RESOLVER = null;
var DATA = [{text:"=================", intent:"=============", score:100, score_val:100 }];
const sessionStore = new session.MemoryStore();
var sess; 

app.use(session({store: sessionStore, secret: 'ssshhhhh',saveUninitialized: true,resave: true}));
app.use(bodyParser.json());      
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static(path.join(__dirname, "views")));
app.use(express.static(path.join(__dirname, "node_modules", "tabulator-tables", "dist", "css")));
app.use(express.static(path.join(__dirname, "node_modules", "tabulator-tables", "dist", "js")));


router.get('/',(req,res) => {
    sess = req.session;
    if(sess.snapshot) {
        return res.redirect('/admin');
    }
    res.sendFile('index.html');
});

// Retrieves data that populates the table control in browser.
// - DATA variable is computed and cached in /inference
router.get('/tabledata',(req,res) => {
    res.send(DATA);
});

// Retrieves list of intents.
router.get('/intents',(req,res) => {
    if (RESOLVER) {
        util.Utility.debuggingLog('/intents called');
        var intents = {};
        var examples = RESOLVER.getExamples();
        for (let example of examples) {
            intents[example.labels[0].name] = example.labels[0].name;
            console.error('INTENT: example: %j', example);
        }
        res.send(intents);
    }

});

// Retrieve all examples in snapshot
router.get('/allexamples',(req,res) => {
    if (RESOLVER) {
        util.Utility.debuggingLog('/allexamples called');
        var allExamples = [];
        var examples = RESOLVER.getExamples();
        util.Utility.debuggingLog('Retrieved ' + examples.length + ' examples from snapshot.');
        for (var i = 0; i < examples.length; i++) {
            var key = examples[i].text + examples[i].labels[0].name;
            var id = farmhash.hash32(key);
            allExamples.push({id:id, text:examples[i].text, intent:examples[i].labels[0].name, score:0, score_val:0 });
            console.error('INTENT: example: %j', examples[i]);
        }
        res.send(allExamples);
    }
});

// Delete an example in snapshot.
router.post('/delete',(req,res) => {
    sess = req.session;
    util.Utility.debuggingLog('Delete example called: utterance: ' + req.body.utterance);
    util.Utility.debuggingLog('Delete example called: intent: ' + req.body.intent);
    if (RESOLVER) {
        const example = { 
            text: req.body.utterance,
            label: { 
                name: req.body.intent,
                span: { 
                    length: 0, 
                    offset: 0 
                },
                label_type: 1
            },
        };
        var results = RESOLVER.removeExample(example);
        if (!results) {
            util.Utility.debuggingLog('ERROR removing example: ' + req.body.intent);
            res.end('Invalid results from addExample!!')
        }
        for (var i= 0; i < DATA.length; i++) {
            if (DATA[i].text == req.body.utterance && DATA[i].intent == req.body.intent) {
                DATA.splice(i, 1);
                break;
            }
        }
        util.Utility.debuggingLog('Removed example: ' + req.body.intent);
        res.end('done')

    }
});

// Save snapshot to original .blu file.
router.post('/save',(req,res) => {
    sess = req.session;
    util.Utility.debuggingLog('Delete example called: snapshot: ' + sess.snapshot);
    if (RESOLVER) {
        const ss = RESOLVER.createSnapshot();
        const outPath = sess.snapshot;
        util.Utility.debuggingLog('Writing snapshot file: ' + outPath);
        const resolvedFilePath = helper.OrchestratorHelper.writeToFile(outPath, ss);
        util.Utility.debuggingLog('Snapshot written: ' + outPath);
        res.end('done')
    }
});


// Evaluate utterance provided in UI.
// - Updates DATA variable which feeds the Table component UI.
router.post('/inference',(req,res) => {
    sess = req.session;
    if (RESOLVER) {
        try {
            util.Utility.debuggingLog('Here is the utterance: ' + req.body.utterance);
            var results = RESOLVER.score(req.body.utterance);
            if (!results) {
                res.end('Invalid results from score!!')
            }
            let tabledata = [];
            for (let result of results) {
                var key = result.closest_text + result.label.name;
                var id = farmhash.hash32(key);
                tabledata.push({id:id, text:result.closest_text, intent:result.label.name, score:(result.score * 100), score_val:(result.score * 100) });
            }
            tabledata.push({id:0, text:"========================================", 
                intent:"UNKNOWN THRESHOLD", score:50, score_val:50 });
            DATA=tabledata;
            res.send(tabledata);
        } catch(err) {
            res.end('Error attempting to retrieve score: ' + err);
            return;
        }
    }
});

// Add a new example to the UI.
router.post('/addexample',(req,res) => {
    sess = req.session;
    util.Utility.debuggingLog('AddExample called: ' + req.body.utterance);
    if (RESOLVER) {
        try {
            util.Utility.debuggingLog('Here is the utterance: ' + req.body.utterance);
            util.Utility.debuggingLog('Here is the intent: ' + req.body.addintent);
            const example = { 
                text: req.body.utterance,
                label: { 
                    name: req.body.addintent,
                    span: { 
                        length: 0, 
                        offset: 0 
                    },
                    label_type: 1
                },
            };
            var results = RESOLVER.addExample(example);
            if (!results) {
                util.Utility.debuggingLog('ERROR adding example: ' + req.body.addintent);
                res.end('Invalid results from addExample!!')
            }
            DATA.push({text:req.body.utterance, intent:req.body.addintent, score:0, score_val:0 });
            res.send(DATA);
        } catch(err) {
            res.end('Error attempting to retrieve score: ' + err);
            return;
        }
    }
});

// Load the snapshot
router.post('/load', async (req,res) => {
    sess = req.session;

    // Validate snapshot    
    try {
        if (!fs.existsSync(req.body.snapshot)) {
            res.end('Invalid Snapshot: ' + req.body.snapshot);
        }
    } catch(err) {
        res.end('Invalid Snapshot: ' + req.body.snapshot + ' ' + err);
        return;
    }
    sess.snapshot = req.body.snapshot;

    // Validate model directory
    try {
        if (!fs.existsSync(req.body.model)) {
            console.error('Invalid Model Directory: ' + req.body.model);
            res.end('Invalid Model Directory: ' + req.body.model);
        }
    } catch(err) {
        res.end('Invalid Model Directory: ' + req.body.model + ' ' + err);
        return;
    }
    sess.model = req.body.model;

    util.Utility.debuggingLog('OrchestratorCreate.runAsync(), ready to call LabelResolver.createAsync()');
    sess.resolver = await resolver.LabelResolver.createWithSnapshotAsync(req.body.model, req.body.snapshot);
    RESOLVER = sess.resolver;
    util.Utility.debuggingLog('OrchestratorCreate.runAsync(), after calling LabelResolver.createAsync()');
    sess.save();
    res.end('done');
});

// Display the editor page.
router.get('/editor',(req,res) => {
    sess = req.session;
    if(sess.snapshot) {
        
        var editorPath = path.join(__dirname, 'views', 'editor.html');
        res.sendFile(editorPath);
    }
    else {
        res.write('<h1>Please set model & snapshot file first.</h1>');
        res.end('<a href='+'/'+'>Configure</a>');
    }
});


// Log out of the editor page.
router.get('/logout',(req,res) => {
    req.session.destroy((err) => {
        if(err) {
            return console.log(err);
        }
        res.redirect('/');
    });

});

app.use('/', router);

app.listen(process.env.PORT || 3000,() => {
    console.log(`App Started on PORT ${process.env.PORT || 3000}`);
});