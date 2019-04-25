'use strict';

ObjC.import('stdlib');

var log = function(message) {
    ObjC.import('Foundation');
    $.NSFileHandle.fileHandleWithStandardOutput
        .writeData($.NSString.alloc.initWithString(message)
        .dataUsingEncoding($.NSNEXTSTEPStringEncoding));
}


function run([world, text]) {
    var se = Application('System Events');
    var app = Application('com.majicjungle.BlockheadsServer');

    // Make sure we have all arguments
    if (!world || !text) {
        log('fail');
        $.exit(1);
    }
    world = world.toLocaleUpperCase();

    // If the app isn't running, exit with an error code
    if (!app.running()) {
        log('fail');
        $.exit(2);
    }

    var appse = se.processes.byName('BlockheadsServer');
    var win = appse.windows.byName("Blockheads Server");

    // Check if BH is the active application, if not, hide it after sending the message.
    var isVisible = appse.frontmost();

    // Show the app.
    app.activate();

    // Open the correct world
    var rows = win.scrollAreas.at(0).tables.at(0).rows;
    var row = rows.whose({ _match: [ ObjectSpecifier().staticTexts[0].value, world ] }).at(0);
    row.selected = true

    win.textFields.at(2).value = text;
    win.textFields.at(2).confirm();

    // Hide the app if it was hidden before.
    if (!isVisible) {
        appse.visible = false;
    }
}

