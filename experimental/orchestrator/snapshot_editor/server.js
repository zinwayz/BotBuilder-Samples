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
const oc = require('orchestrator-core');
const util = require('@microsoft/bf-orchestrator/lib/utility');
const resolver = require('@microsoft/bf-orchestrator/lib/labelresolver');
const helper = require('@microsoft/bf-orchestrator/lib/orchestratorhelper');

require('fast-text-encoding');
// Globals 
// BUGBUG: These need to be put into a session.
var RESOLVER = null;
var RESOLVER_ALL_EXAMPLES = null;
var DATA = [{text:"=================", intent:"=============", score:100, score_val:100 }];
var VENNSET = [
    {"sets": [0], "label": "Snapshot", "size": 200},
    {"sets": [1], "label": "Editor", "size": 200},
    {"sets": [0, 1], "size": 2 }
    ];
var VENPERCENT = .01;
var CURRENT_UTTERANCE = "";
const OVERLAPBYINTENT = new Map();
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

// Retrieves data that populates the table control in browser.
// This is driven by the browser venn diagram and can filter.
// - DATA variable is computed and cached in /inference
router.get('/venntabledata',(req,res) => {
    let key= req.query.intent;
    util.Utility.debuggingLog('/venntabledata called with intent ' + key);
    if (OVERLAPBYINTENT.has(key)) {
        DATA = OVERLAPBYINTENT.get(key);
    }
    res.send(DATA);
});

// Retrieves data for venn.js
router.post('/vennset',(req,res) => {
    var percent = req.body.percent;
    //util.Utility.debuggingLog('/vennset called with percentage ' + percent);

    if (percent && percent > 0 && RESOLVER && percent < 100) {
        var results = RESOLVER_ALL_EXAMPLES.score(CURRENT_UTTERANCE);
        if (!results) {
            res.end('Invalid results from score!!')
        }
        VENPERCENT = percent/100;
        VENNSET = computeVenn(results, CURRENT_UTTERANCE);
    }

    res.send(VENNSET);
});

// Retrieves list of intents.
router.get('/intents',(req,res) => {
    if (RESOLVER) {
        util.Utility.debuggingLog('/intents called');
        var intents = {};
        var examples = RESOLVER.getExamples();
        for (let example of examples) {
            intents[example.labels[0].name] = example.labels[0].name;
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
        var results = RESOLVER_ALL_EXAMPLES.removeExample(example);
        if (!results) {
            util.Utility.debuggingLog('ERROR removing example from ALL examples: ' + req.body.intent);
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

router.post('/save',(req,res) => {
    sess = req.session;
    util.Utility.debuggingLog('Delete example called: snapshot: ' + sess.snapshot);
    if (RESOLVER) {
        const snapshot = RESOLVER.createSnapshot();
        const outPath = sess.snapshot;
        util.Utility.debuggingLog('Writing snapshot file: ' + outPath);
        const resolvedFilePath = helper.OrchestratorHelper.writeToFile(outPath, snapshot);
        util.Utility.debuggingLog('Snapshot written: ' + outPath);
        res.end('done')
    }
});

function compareScore(a, b) {
  return b.score - a.score;
}
function computeVenn(scores, utterance){
    var results = []
    if (!scores || scores.length <= 0) {
        return results;
    }
    
    var overlapCount = Math.trunc(scores.length * VENPERCENT);
    scores.sort(compareScore);
    var topIntent = scores[0].label.name;
    var topOverlap = scores.slice(0, overlapCount)
            .map(i => { 
                return {intent: i.label.name, score: i.score*100, text: i.closest_text, score_val: i.score }; });

    var countByIntent = new Map();
    for (let result of scores) {
        var key = result.label.name;
        
        if (countByIntent.has(key)) {
            var count = countByIntent.get(key);
            countByIntent.set(key, count+1);
        }
        else {
            countByIntent.set(key, 1);
        }
    }
    
    // Set all intents by size in results
    var i=1;
    var topSetIndex = 0;
    var setIndexByIntent = new Map();
    // Push main sentence
    results.push({"sets":[0], "label": utterance, "size": scores.length})
    for (var entry of countByIntent.entries()) {
        var intent = entry[0],
            count = entry[1];
        if (intent == topIntent) {
            topSetIndex = i;
        }
        if (!setIndexByIntent.has(intent)) {
            setIndexByIntent.set(intent, i);
        }
        results.push({"sets":[i], "label": intent, "size": count})
        i = i+1;
    }
    
    // Calc overlap
    OVERLAPBYINTENT.clear();
    for (let score of topOverlap) {
        var key = score.intent;
        if (OVERLAPBYINTENT.has(key)) {
            var scores = OVERLAPBYINTENT.get(key);
            scores.push(score);
            OVERLAPBYINTENT.set(key, scores);
        }
        else {
            OVERLAPBYINTENT.set(key, [score]);
        }
    }
    // Set overlap in results
    for (var entry of OVERLAPBYINTENT.entries()) {
        var intent = entry[0],
            scores = entry[1];
        results.push({"sets":[0, setIndexByIntent.get(intent)], "size": scores.length, "intent":intent});
    }
    
    return results;
}

// Evaluate utterance provided in UI.
// - Updates DATA variable which feeds the Table component UI.
router.post('/inference',(req,res) => {
    sess = req.session;
    if (RESOLVER) {
        try {
            CURRENT_UTTERANCE = req.body.utterance;
            util.Utility.debuggingLog('Here is the utterance: ' + CURRENT_UTTERANCE);
            var results = RESOLVER.score(CURRENT_UTTERANCE);

            if (!results) {
                res.end('Invalid results from score!!')
            }
            var all_results = RESOLVER_ALL_EXAMPLES.score(CURRENT_UTTERANCE);

            let tabledata = [];
            //======================================
            // No Venn diagram until we can get all results somehow.
            VENNSET = computeVenn(all_results, CURRENT_UTTERANCE);
            //======================================
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
            var results = RESOLVER_ALL_EXAMPLES.addExample(example);
            if (!results) {
                util.Utility.debuggingLog('ERROR adding example to ALL examples: ' + req.body.addintent);
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
    var snapPath;
    var modelFolder;
    // Validate snapshot    
    try {
        if (!fs.existsSync(req.body.snapshot)) {
            res.end('Invalid Snapshot: ' + req.body.snapshot);
        }
        snapPath = path.resolve(req.body.snapshot);
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
        modelFolder = path.resolve(req.body.model)
    } catch(err) {
        res.end('Invalid Model Directory: ' + req.body.model + ' ' + err);
        return;
    }
    sess.model = req.body.model;

    util.Utility.debuggingLog('OrchestratorCreate.runAsync(), ready to call LabelResolver.createWithSnapshotAsync()');
    util.Utility.debuggingLog(' model folder: ' + modelFolder);
    util.Utility.debuggingLog(' snapshot path: ' + snapPath);

    //sess.resolver = await resolver.LabelResolver.createWithSnapshotAsync(modelFolder, snapPath);
    const orchestrator = new oc.Orchestrator();
    const load_result = await orchestrator.loadAsync(modelFolder); // Return boolean, separate load.

    //util.Utility.debuggingLog(' Load Model result: ' + load_result);
    RESOLVER = orchestrator.createLabelResolver();
    try {
        RESOLVER.addSnapshot(helper.OrchestratorHelper.getSnapshotFromFile(snapPath));
    } catch(err) {
        util.Utility.debuggingLog(' ERROR creating snapshot: ' + err);
        return;
    }
    let config_json = RESOLVER.getConfigJson();
    util.Utility.debuggingLog('  RESOLVER Config : ' + config_json);

    RESOLVER_ALL_EXAMPLES = orchestrator.createLabelResolver();
    try {
        RESOLVER_ALL_EXAMPLES.addSnapshot(helper.OrchestratorHelper.getSnapshotFromFile(snapPath));
    } catch(err) {
        util.Utility.debuggingLog(' ERROR creating snapshot: ' + err);
        return;
    }

    let config = JSON.parse(RESOLVER_ALL_EXAMPLES.getConfigJson());
    config["score_all_examples"] = true;
    let set_runtime_params_results= RESOLVER_ALL_EXAMPLES.setRuntimeParams(JSON.stringify(config), true);
    if (set_runtime_params_results==true) {
      util.Utility.debuggingLog(' Set to return all examples during score.');
    }
    else {
      util.Utility.debuggingLog(' Set runtime params failed!!');        
    }

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