/*jslint node: true */
"use strict";
const db = require('ocore/db.js');


db.query("CREATE TABLE IF NOT EXISTS client_channels (  \n\
	id INTEGER PRIMARY KEY AUTOINCREMENT,\n\
	client_address CHAR(32), \n\
	aa_address CHAR(32) UNIQUE, \n\
	amount_spent_by_user INTEGER DEFAULT 0,\n\
	due_amount_by_user INTEGER DEFAULT 0,\n\
	period INTEGER DEFAULT 1,\n\
	last_message_from_user TEXT,\n\
	is_opened TINYINT DEFAULT 0,\n\
	creation_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP\n\
);");

db.query("CREATE TABLE IF NOT EXISTS provider_channels (  \n\
	url VARCHAR(100) UNIQUE,\n\
	id INTEGER,\n\
	definition TEXT,\n\
	version INTEGER,\n\
	amount_spent INTEGER DEFAULT 0, \n\
	period INTEGER DEFAULT 1,\n\
	aa_address CHAR(32) UNIQUE, \n\
	is_opened TINYINT DEFAULT 0,\n\
	creation_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP\n\
);");