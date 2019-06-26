/*jslint node: true */
"use strict";
const db = require('ocore/db.js');


db.query("CREATE TABLE IF NOT EXISTS channels (  \n\
	id INTEGER PRIMARY KEY AUTOINCREMENT,\n\
	client_address CHAR(32), \n\
	aa_address CHAR(32) UNIQUE, \n\
	amount_spent_by_user INTEGER DEFAULT 0,\n\
	last_message_from_user TEXT,\n\
	is_open TINYINT DEFAULT 1,\n\
	creation_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP\n\
);");

