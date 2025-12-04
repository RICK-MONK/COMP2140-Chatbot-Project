const fs = require('fs');
const path = require('path');

const remindersFile = path.join(__dirname, '../reminders.json');

function readReminders() {
    if (!fs.existsSync(remindersFile)) return [];
    try {
        return JSON.parse(fs.readFileSync(remindersFile));
    } catch (e) {
        return [];
    }
}

function logReminder(entry) {
    const reminders = readReminders();
    reminders.unshift({
        ...entry,
        loggedAt: new Date().toISOString()
    });
    fs.writeFileSync(remindersFile, JSON.stringify(reminders, null, 2));
}

module.exports = { readReminders, logReminder };
