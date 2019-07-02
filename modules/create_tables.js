/*jslint node: true */
"use strict";
const db = require('ocore/db.js');


db.query("CREATE TABLE IF NOT EXISTS client_channels (  \n\
	id INTEGER PRIMARY KEY AUTOINCREMENT,\n\
	client_address CHAR(32), \n\
	aa_address CHAR(32) UNIQUE, \n\
	amount_spent_by_user INTEGER DEFAULT 0,\n\
	due_amount_by_user INTEGER DEFAULT 0,\n\
	period INTEGER DEFAULT 0,\n\
	last_message_from_user TEXT,\n\
	status VARCHAR(30) DEFAULT 'new',\n\
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP\n\
);");

db.query("CREATE TABLE IF NOT EXISTS provider_channels (  \n\
	url VARCHAR(100) UNIQUE,\n\
	id INTEGER,\n\
	definition TEXT,\n\
	version INTEGER,\n\
	amount_spent INTEGER DEFAULT 0, \n\
	period INTEGER DEFAULT 0,\n\
	aa_address CHAR(32) UNIQUE, \n\
	status VARCHAR(30) DEFAULT 'new',\n\
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP\n\
);");