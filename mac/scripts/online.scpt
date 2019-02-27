'use strict';

ObjC.import('stdlib');
var log = function(message) {
    ObjC.import('Foundation');
    $.NSFileHandle.fileHandleWithStandardOutput
        .writeData($.NSString.alloc.initWithString(message)
        .dataUsingEncoding($.NSNEXTSTEPStringEncoding));
}

function run([world]) {
    var se = Application('System Events');
    var app = Application('com.majicjungle.BlockheadsServer');

    // Make sure we have all arguments
    if (!world) {
        $.exit(1);
    }
    world = world.toLocaleUpperCase();

    // If the app isn't running, exit with an error code
    if (!app.running()) {
        $.exit(2);
    }

    var appse = se.processes.byName('BlockheadsServer');
    var win = appse.windows.byName("Blockheads Server");

    // Check if BH is the active application, if not, hide it after getting online players.
    var isVisible = appse.frontmost();

    // Show the app.
    app.activate();

    // Open the correct world
    var rows = win.scrollAreas.at(0).tables.at(0).rows;
    var row = rows.whose({ _match: [ ObjectSpecifier().staticTexts[0].value, world ] }).at(0);
    row.selected = true

    // Loop through the players table
    var playerRows = win.scrollAreas.at(1).tables.at(0).rows;
    var players = [];
    for (var i = 0; i < playerRows.length; i++) {
        playerRows.at(i).selected = true;
        // If kick button doesn't enable, not online. Finished.
        if (!win.buttons.at(3).enabled()) break;

        var name = playerRows.at(i).staticTexts.at(0).value();
        // Remove IP
        name = name.substr(0, name.lastIndexOf('(') - 1);
        players.push(name);
    }
    log(JSON.stringify(players));

    // Hide the app if it was hidden before.
    if (!isVisible) {
        appse.visible = false;
    }
}
