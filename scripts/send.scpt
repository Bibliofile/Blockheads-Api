'use strict';

ObjC.import('stdlib');

function run([world, text]) {
    var se = Application('System Events');
    var app = Application('com.majicjungle.BlockheadsServer');

    // Make sure we have all arguments
    if (!world || !text) {
        console.log('fail');
        $.exit(1);
    }
    world = world.toLocaleUpperCase();

    // If the app isn't running, exit with an error code
    if (!app.running()) {
        console.log('fail');
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
    for (var i = 0; i < rows.length; i++) {
        if (rows.at(i).staticTexts.at(0).value() == world) {
            rows.at(i).selected = true;
            break;
        }
    }

    // Set the message field to the text and send the message.
    win.textFields.at(2).value = text;
    win.textFields.at(2).confirm();

    // Hide the app if it was hidden before.
    if (!isVisible) {
        appse.visible = false;
    }
}
