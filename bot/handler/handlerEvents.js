const fs = require("fs-extra");
const nullAndUndefined = [undefined, null];
// const { config } = global.GoatBot;
// const { utils } = global;

// ========== APPROVED GC LIST ==========
const approvedGCsPath = './approvedGCs.json';
let approvedGCs = new Set();

if (fs.existsSync(approvedGCsPath)) {
	const data = fs.readFileSync(approvedGCsPath, 'utf-8');
	try {
		approvedGCs = new Set(JSON.parse(data));
	} catch(e){
		approvedGCs = new Set();
	}
}

function saveApprovedGCs() {
	fs.writeFileSync(approvedGCsPath, JSON.stringify([...approvedGCs]));
}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// NEW: Make approvedGCs and saveApprovedGCs globally accessible
if (global.GoatBot) {
    global.GoatBot.approvedGCs = {
        data: approvedGCs,
        save: saveApprovedGCs
    };
}
// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

function getType(obj) {
	return Object.prototype.toString.call(obj).slice(8, -1);
}
// ... [Remaining functions (getRole, getText, replaceShortcutInLang, getRoleConfig, etc.) remain unchanged]
function getRole(threadData, senderID) {
	const adminBot = global.GoatBot.config.adminBot || [];
	if (!senderID) return 0;
	const adminBox = threadData ? threadData.adminIDs || [] : [];
	return adminBot.includes(senderID) ? 2 : adminBox.includes(senderID) ? 1 : 0;
}

function getText(type, reason, time, targetID, lang) {
	const utils = global.utils;
	if (type == "userBanned") return utils.getText({ lang, head: "handlerEvents" }, "userBanned", reason, time, targetID);
	else if (type == "threadBanned") return utils.getText({ lang, head: "handlerEvents" }, "threadBanned", reason, time, targetID);
	else if (type == "onlyAdminBox") return utils.getText({ lang, head: "handlerEvents" }, "onlyAdminBox");
	else if (type == "onlyAdminBot") return utils.getText({ lang, head: "handlerEvents" }, "onlyAdminBot");
}

function replaceShortcutInLang(text, prefix, commandName) {
	return text
		.replace(/{(?:p|prefix)}/g, prefix)
		.replace(/{(?:n|name)}/g, commandName)
		.replace(/{pn}/g, `${prefix}${commandName}`);
}

function getRoleConfig(utils, command, isGroup, threadData, commandName) {
	let roleConfig;
	if (utils.isNumber(command.config.role)) {
		roleConfig = { onStart: command.config.role };
	} else if (typeof command.config.role == "object" && !Array.isArray(command.config.role)) {
		if (!command.config.role.onStart) command.config.role.onStart = 0;
		roleConfig = command.config.role;
	} else {
		roleConfig = { onStart: 0 };
	}
	if (isGroup)
		roleConfig.onStart = threadData.data.setRole?.[commandName] ?? roleConfig.onStart;
	for (const key of ["onChat", "onStart", "onReaction", "onReply"]) {
		if (roleConfig[key] == undefined)
			roleConfig[key] = roleConfig.onStart;
	}

	return roleConfig;
	// {
	// 	onChat,
	// 	onStart,
	// 	onReaction,
	// 	onReply
	// }

}

// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// NEW: Asynchronous sleep function for delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const DELAY_TIME = 3000; // 3 seconds delay
// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

async function isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, lang) {
	const config = global.GoatBot.config;
	const { adminBot, hideNotiMessage } = config;
	// check if user banned
	const infoBannedUser = userData.banned;
	if (infoBannedUser.status == true) {
		const { reason, date } = infoBannedUser;
		if (hideNotiMessage.userBanned == false) {
			await sleep(DELAY_TIME); // ADDED DELAY
			message.reply(getText("userBanned", reason, date, senderID, lang));
		}
		return true;
	}

	// check if only admin bot
	if (
		config.adminOnly.enable == true
		&& !adminBot.includes(senderID)
		&& !config.adminOnly.ignoreCommand.includes(commandName)
	) {
		if (hideNotiMessage.adminOnly == false) {
			await sleep(DELAY_TIME); // ADDED DELAY
			message.reply(getText("onlyAdminBot", null, null, null, lang));
		}
		return true;
	}

	// ==========    Check Thread    ========== //
	if (isGroup == true) {
		if (
			threadData.data.onlyAdminBox === true
			&& !threadData.adminIDs.includes(senderID)
			&& !(threadData.data.ignoreCommanToOnlyAdminBox || []).includes(commandName)
		) {
			// check if only admin box
			if (!threadData.data.hideNotiMessageOnlyAdminBox) {
				await sleep(DELAY_TIME); // ADDED DELAY
				message.reply(getText("onlyAdminBox", null, null, null, lang));
			}
			return true;
		}

		// check if thread banned
		const infoBannedThread = threadData.banned;
		if (infoBannedThread.status == true) {
			const { reason, date } = infoBannedThread;
			if (hideNotiMessage.threadBanned == false) {
				await sleep(DELAY_TIME); // ADDED DELAY
				message.reply(getText("threadBanned", reason, date, threadID, lang));
			}
			return true;
		}
	}
	return false;

}

function createGetText2(langCode, pathCustomLang, prefix, command) {
	const commandType = command.config.countDown ? "command" : "command event";
	const commandName = command.config.name;
	let customLang = {};
	let getText2 = () => { };
	if (fs.existsSync(pathCustomLang)) customLang = require(pathCustomLang)[commandName]?.text || {};
	if (command.langs || customLang || {}) {
		getText2 = function (key, ...args) {
			let lang = command.langs?.[langCode]?.[key] || customLang[key] || "";
			lang = replaceShortcutInLang(lang, prefix, commandName);
			for (let i = args.length - 1; i >= 0; i--) lang = lang.replace(new RegExp(`%${i + 1}`, "g"), args[i]);
			return lang || `❌ Can't find text on language "${langCode}" for ${commandType} "${commandName}" with key "${key}"`;
		};
	}
	return getText2;
}


// >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// NEW: ANTI-SPAM AND BAN CONFIGURATION
const SPAM_WARNING_COUNT = 12; // ১২ বার একই মেসেজে সতর্কীকরণ
const SPAM_BAN_COUNT = 22;      // ১২ + ১০ = ২২ বার একই মেসেজে ব্যান
const BAN_DURATION_MS = 60 * 60 * 1000; // ১ ঘন্টা (৬০ মিনিট)
const SPAM_TIMEOUT_MS = 30000;  // ৩০ সেকেন্ডের মধ্যে নতুন বার্তা না এলে স্প্যাম কাউন্ট রিসেট হবে

// গ্লোবাল স্টেট ইনিশিয়ালাইজেশন (ইন-মেমরি স্টোরেজ)
if (!global.spamTracker) global.spamTracker = new Map();
if (!global.bannedUsers) global.bannedUsers = new Map();
// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<


module.exports = function (api, threadModel, userModel, dashBoardModel, globalModel, usersData, threadsData, dashBoardData, globalData) {
	return async function (event, message) {
		const { utils, client, GoatBot } = global;
		const { getPrefix, removeHomeDir, log, getTime } = utils;
		const { config, configCommands: { envGlobal, envCommands, envEvents } } = GoatBot;
		const { autoRefreshThreadInfoFirstTime } = config.database;
		let { hideNotiMessage = {} } = config;

		const { body, messageID, threadID, isGroup } = event;

		// Check if has threadID
		if (!threadID)
			return;

		const senderID = event.userID || event.senderID || event.author;
		// ======== AUTO-LEAVE UNAPPROVED GROUP (FIXED LOCATION) ========
		// This should be outside of the main data fetching block to ensure immediate action
		if (event.type === 'groupAdd' && threadID) {
			const gcID = threadID;
			const botID = client.getCurrentUserID ? client.getCurrentUserID() : global.GoatBot.config.botID;
            
            // Check if the bot itself was added in this event
			if (event.logMessageData?.addedParticipants?.some(p => p.userFbId == botID) && !approvedGCs.has(gcID)) {
				// Added a small delay before sending a message to ensure bot is ready
                await sleep(1000); 
				if (client.sendMessage) {
					await client.sendMessage(gcID, "❌ **This GC is not approved.** Please get approval from admin.\n\nঅনুমোদন না পাওয়ায় বট এই গ্রুপে থাকতে পারছে না। অনুমোদনের জন্য এডমিনের সাথে যোগাযোগ করুন।");
				}
                // Added another small delay before leaving
                await sleep(1000);
				if (client.leaveGroup) await client.leaveGroup(gcID);
				return; // stop further processing for this GC
			}
		}
        // =============================================================
        
		let threadData = global.db.allThreadData.find(t => t.threadID == threadID);
		let userData = global.db.allUserData.find(u => u.userID == senderID);

		if (!userData && !isNaN(senderID))
			userData = await usersData.create(senderID);

		if (!threadData && !isNaN(threadID)) {
			if (global.temp.createThreadDataError.includes(threadID))
				return;
			threadData = await threadsData.create(threadID);
			global.db.receivedTheFirstMessage[threadID] = true;
		}
		else {
			if (
				autoRefreshThreadInfoFirstTime === true
				&& !global.db.receivedTheFirstMessage[threadID]
			) {
				global.db.receivedTheFirstMessage[threadID] = true;
				await threadsData.refreshInfo(threadID);
			}
		}

		if (typeof threadData.settings.hideNotiMessage == "object")
			hideNotiMessage = threadData.settings.hideNotiMessage;

		const prefix = getPrefix(threadID);
		const role = getRole(threadData, senderID);
		const parameters = {
			api, usersData, threadsData, message, event,
			userModel, threadModel, prefix, dashBoardModel,
			globalModel, dashBoardData, globalData, envCommands,
			envEvents, envGlobal, role,
			removeCommandNameFromBody: function removeCommandNameFromBody(body_, prefix_, commandName_) {
				if ([body_, prefix_, commandName_].every(x => nullAndUndefined.includes(x)))
					throw new Error("Please provide body, prefix and commandName to use this function, this function without parameters only support for onStart");
				for (let i = 0; i < arguments.length; i++)
					if (typeof arguments[i] != "string")
						throw new Error(`The parameter "${i + 1}" must be a string, but got "${getType(arguments[i])}"`);

				return body_.replace(new RegExp(`^${prefix_}(\\s+|)${commandName_}`, "i"), "").trim();
			}
		};
		const langCode = threadData.data.lang || config.language || "en";

		function createMessageSyntaxError(commandName) {
			message.SyntaxError = async function () {
				await sleep(DELAY_TIME); // ADDED DELAY
				return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "commandSyntaxError", prefix, commandName));
			};
		}

		/*
		 +-----------------------------------------------------------------+
		 |                          ANTI-SPAM LOGIC                         |
		 +-----------------------------------------------------------------+
		*/
		const text = event.body ? event.body.trim() : "";
		// শুধুমাত্র টেক্সট মেসেজ এবং গ্রুপ চ্যাটের জন্য স্প্যাম চেক
		if (text && isGroup) {
			// ১. ব্যান চেক লজিক
			const banInfo = global.bannedUsers.get(senderID);
			if (banInfo) {
				const timeRemainingMS = banInfo.bannedUntil - Date.now();
				
				if (timeRemainingMS <= 0) {
					// ব্যান এর সময় শেষ
					global.bannedUsers.delete(senderID);
					// ব্যান শেষ হওয়ার বার্তা
					client.sendMessage(`✅ আইডি **${senderID}**-এর উপর থেকে স্বয়ংক্রিয়ভাবে নিষেধাজ্ঞা (ban) তুলে নেওয়া হলো। আপনি এখন থেকে আবার বট ব্যবহার করতে পারবেন।`, threadID);
					// ব্যান শেষ হওয়ায় মেসেজটি এবার স্বাভাবিকভাবে প্রক্রিয়া করা হবে
				} else {
					// এখনও নিষিদ্ধ (banned)
					const remainingMinutes = Math.ceil(timeRemainingMS / (60 * 1000));
					
					// অনুরোধ করা ব্যান মেসেজ রিপ্লাই
					const banMessage = `You will be banned from shinobu Ai\nRemaining normal user (time left : ${remainingMinutes} minute)`;
					
					// মেসেজের রিপ্লাই হিসেবে পাঠানো হচ্ছে (DELAY_TIME ব্যবহার করা হয়নি, কারণ এটি জরুরি রিপ্লাই)
					client.sendMessage(banMessage, threadID, messageID);
					return; // এই মেসেজের জন্য অন্য কোনো কমান্ড বা ইভেন্ট প্রক্রিয়া করা হবে না
				}
			}

			// ২. স্প্যাম ডিটেকশন লজিক
			let spamData = global.spamTracker.get(senderID) || { text: "", count: 0, lastSpamTime: 0 };
			
			// স্প্যাম কাউন্ট রিসেট করুন যদি: মেসেজটি ভিন্ন হয়, অথবা শেষ স্প্যাম করার পর যথেষ্ট সময় পার হয়ে গেছে
			if (text !== spamData.text || (Date.now() - spamData.lastSpamTime) > SPAM_TIMEOUT_MS) {
				spamData = {
					text: text,
					count: 1,
					lastSpamTime: Date.now()
				};
			} else {
				// একই মেসেজ, কাউন্ট বাড়ান
				spamData.count++;
				spamData.lastSpamTime = Date.now(); // শেষ কার্যকলাপের সময় আপডেট করুন
			}
			
			global.spamTracker.set(senderID, spamData);
			
			// --- সতর্কীকরণ চেক (Count = 12) ---
			if (spamData.count === SPAM_WARNING_COUNT) {
				const warningMessage = "⚠️ You're spamming, plz stop."; // অনুরোধ করা মেসেজ
				client.sendMessage(warningMessage, threadID, messageID);
			}
			
			// --- ব্যান চেক (Count = 22 বা তার বেশি) ---
			if (spamData.count >= SPAM_BAN_COUNT) {
				// ১ ঘন্টার জন্য ব্যবহারকারীকে ব্যান করুন
				const banDurationMinutes = BAN_DURATION_MS / (60 * 1000); // ৬০ মিনিট
				const bannedUntil = Date.now() + BAN_DURATION_MS;
				
				global.bannedUsers.set(senderID, {
					bannedUntil: bannedUntil,
					banTime: banDurationMinutes
				});
				
				// ব্যান করার পর স্প্যাম ডেটা পরিষ্কার করুন
				global.spamTracker.delete(senderID);
				
				const banMessage = `🛑 স্প্যামিং এর কারণে আপনি Shinobu Ai থেকে **${banDurationMinutes} মিনিটের** জন্য নিষিদ্ধ (banned) হয়েছেন।`;
				
				client.sendMessage(banMessage, threadID, messageID);
				return; // ব্যান মেসেজ পাঠানোর পর অন্য কোনো প্রক্রিয়া বন্ধ করুন
			}
		}
		
		/*
		 +-----------------------------------------------------------------+
		 |                          END ANTI-SPAM LOGIC                     |
		 +-----------------------------------------------------------------+
		*/


		/*
			+-----------------------------------------------+
			|							 WHEN CALL COMMAND								|
			+-----------------------------------------------+
		*/
		let isUserCallCommand = false;
		async function onStart() {
			// —————————————— CHECK USE BOT —————————————— //
			if (!body || !body.startsWith(prefix))
				return;
			const dateNow = Date.now();
			const args = body.slice(prefix.length).trim().split(/ +/);
			// ————————————  CHECK HAS COMMAND ——————————— //
			let commandName = args.shift().toLowerCase();
			let command = GoatBot.commands.get(commandName) || GoatBot.commands.get(GoatBot.aliases.get(commandName));
			// ———————— CHECK ALIASES SET BY GROUP ———————— //
			const aliasesData = threadData.data.aliases || {};
			for (const cmdName in aliasesData) {
				if (aliasesData[cmdName].includes(commandName)) {
					command = GoatBot.commands.get(cmdName);
					break;
				}
			}
			// ————————————— SET COMMAND NAME ————————————— //
			if (command)
				commandName = command.config.name;
			// ——————— FUNCTION REMOVE COMMAND NAME ———————— //
			function removeCommandNameFromBody(body_, prefix_, commandName_) {
				if (arguments.length) {
					if (typeof body_ != "string")
						throw new Error(`The first argument (body) must be a string, but got "${getType(body_)}"`);
					if (typeof prefix_ != "string")
						throw new Error(`The second argument (prefix) must be a string, but got "${getType(prefix_)}"`);
					if (typeof commandName_ != "string")
						throw new Error(`The third argument (commandName) must be a string, but got "${getType(commandName_)}"`);

					return body_.replace(new RegExp(`^${prefix_}(\\s+|)${commandName_}`, "i"), "").trim();
				}
				else {
					return body.replace(new RegExp(`^${prefix}(\\s+|)${commandName}`, "i"), "").trim();
				}
			}
			// —————  CHECK BANNED OR ONLY ADMIN BOX  ————— //
			if (await isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
				return;
			if (!command)
				if (!hideNotiMessage.commandNotFound) {
					await sleep(DELAY_TIME); // ADDED DELAY
					return await message.reply(
						commandName ?
							utils.getText({ lang: langCode, head: "handlerEvents" }, "commandNotFound", commandName, prefix) :
							utils.getText({ lang: langCode, head: "handlerEvents" }, "commandNotFound2", prefix)
					);
				}
				else
					return true;
			// ————————————— CHECK PERMISSION ———————————— //
			const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
			const needRole = roleConfig.onStart;

			if (needRole > role) {
				if (!hideNotiMessage.needRoleToUseCmd) {
					if (needRole == 1) {
						await sleep(DELAY_TIME); // ADDED DELAY
						return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdmin", commandName));
					}
					else if (needRole == 2) {
						await sleep(DELAY_TIME); // ADDED DELAY
						return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBot2", commandName));
					}
				}
				else {
					return true;
				}
			}
			// ———————————————— countDown ———————————————— //
			if (!client.countDown[commandName])
				client.countDown[commandName] = {};
			const timestamps = client.countDown[commandName];
			let getCoolDown = command.config.countDown;
			if (!getCoolDown && getCoolDown != 0 || isNaN(getCoolDown))
				getCoolDown = 1;
			const cooldownCommand = getCoolDown * 1000;
			if (timestamps[senderID]) {
				const expirationTime = timestamps[senderID] + cooldownCommand;
				if (dateNow < expirationTime) {
					await sleep(DELAY_TIME); // ADDED DELAY
					return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "waitingForCommand", ((expirationTime - dateNow) / 1000).toString().slice(0, 3)));
				}
			}
			// === CREDIT SYSTEM CHECK ===
			try {
				const creditCmd = global.GoatBot?.commands?.get("credit");
				if (creditCmd?.onBefore) {
					await creditCmd.onBefore({ event, commandName, usersData });
				}
			} catch (err) {
				await sleep(DELAY_TIME); // ADDED DELAY
				return message.reply(err.message);
			}
			// ——————————————— RUN COMMAND ——————————————— //
			const time = getTime("DD/MM/YYYY HH:mm:ss");
			isUserCallCommand = true;
			try {
				// analytics command call
				(async () => {
					const analytics = await globalData.get("analytics", "data", {});
					if (!analytics[commandName]) analytics[commandName] = 0;
					analytics[commandName]++;
					await globalData.set("analytics", analytics, "data");
				})();
				createMessageSyntaxError(commandName);
				const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
				// Delay before running the command logic (which might lead to a reply)
				await sleep(DELAY_TIME); // ADDED DELAY before command logic
				await command.onStart({
					...parameters,
					args,
					commandName,
					getLang: getText2,
					removeCommandNameFromBody
				});
				timestamps[senderID] = dateNow;
				log.info("CALL COMMAND", `${commandName} | ${userData.name} | ${senderID} | ${threadID} | ${args.join(" ")}`);
			}
			catch (err) {
				log.err("CALL COMMAND", `An error occurred when calling the command ${commandName}`, err);
				await sleep(DELAY_TIME); // ADDED DELAY
				return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
			}
		}

		/*
		 +------------------------------------------------+
		 |                    ON CHAT                     |
		 +------------------------------------------------+
		*/
		async function onChat() {
			const allOnChat = GoatBot.onChat || [];
			const args = body ? body.split(/ +/) : [];
			for (const key of allOnChat) {
				const command = GoatBot.commands.get(key);
				if (!command)
					continue;
				const commandName = command.config.name;

				// —————————————— CHECK PERMISSION —————————————— //
				const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
				const needRole = roleConfig.onChat;
				if (needRole > role)
					continue;

				const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
				const time = getTime("DD/MM/YYYY HH:mm:ss");
				createMessageSyntaxError(commandName);

				if (getType(command.onChat) == "Function") {
					const defaultOnChat = command.onChat;
					// convert to AsyncFunction
					command.onChat = async function () {
						return defaultOnChat(...arguments);
					};
				}

				command.onChat({
					...parameters,
					isUserCallCommand,
					args,
					commandName,
					getLang: getText2
				})
					.then(async (handler) => {
						if (typeof handler == "function") {
							if (await isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
								return;
							try {
								await sleep(DELAY_TIME); // ADDED DELAY before handler execution
								await handler();
								log.info("onChat", `${commandName} | ${userData.name} | ${senderID} | ${threadID} | ${args.join(" ")}`);
							}
							catch (err) {
								await sleep(DELAY_TIME); // ADDED DELAY
								await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred2", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
							}
						}
					})
					.catch(err => {
						log.err("onChat", `An error occurred when calling the command onChat ${commandName}`, err);
					});
			}
		}

		/*
		 +------------------------------------------------+
		 |                   ON ANY EVENT                 |
		 +------------------------------------------------+
		*/
		async function onAnyEvent() {
			const allOnAnyEvent = GoatBot.onAnyEvent || [];
			let args = [];
			if (typeof event.body == "string" && event.body.startsWith(prefix))
				args = event.body.split(/ +/);

			for (const key of allOnAnyEvent) {
				if (typeof key !== "string")
					continue;
				const command = GoatBot.commands.get(key);
				if (!command)
					continue;
				const commandName = command.config.name;
				const time = getTime("DD/MM/YYYY HH:mm:ss");
				createMessageSyntaxError(commandName);

				const getText2 = createGetText2(langCode, `${process.cwd()}/languages/events/${langCode}.js`, prefix, command);

				if (getType(command.onAnyEvent) == "Function") {
					const defaultOnAnyEvent = command.onAnyEvent;
					// convert to AsyncFunction
					command.onAnyEvent = async function () {
						return defaultOnAnyEvent(...arguments);
					};
				}

				command.onAnyEvent({
					...parameters,
					args,
					commandName,
					getLang: getText2
				})
					.then(async (handler) => {
						if (typeof handler == "function") {
							try {
								await sleep(DELAY_TIME); // ADDED DELAY before handler execution
								await handler();
								log.info("onAnyEvent", `${commandName} | ${senderID} | ${userData.name} | ${threadID}`);
							}
							catch (err) {
								await sleep(DELAY_TIME); // ADDED DELAY
								message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred7", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
								log.err("onAnyEvent", `An error occurred when calling the command onAnyEvent ${commandName}`, err);
							}
						}
					})
					.catch(err => {
						log.err("onAnyEvent", `An error occurred when calling the command onAnyEvent ${commandName}`, err);
					});
			}
		}

		/*
		 +------------------------------------------------+
		 |                  ON FIRST CHAT                 |
		 +------------------------------------------------+
		*/
		async function onFirstChat() {
			const allOnFirstChat = GoatBot.onFirstChat || [];
			const args = body ? body.split(/ +/) : [];

			for (const itemOnFirstChat of allOnFirstChat) {
				const { commandName, threadIDsChattedFirstTime } = itemOnFirstChat;
				if (threadIDsChattedFirstTime.includes(threadID))
					continue;
				const command = GoatBot.commands.get(commandName);
				if (!command)
					continue;

				itemOnFirstChat.threadIDsChattedFirstTime.push(threadID);
				const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
				const time = getTime("DD/MM/YYYY HH:mm:ss");
				createMessageSyntaxError(commandName);

				if (getType(command.onFirstChat) == "Function") {
					const defaultOnFirstChat = command.onFirstChat;
					// convert to AsyncFunction
					command.onFirstChat = async function () {
						return defaultOnFirstChat(...arguments);
					};
				}

				command.onFirstChat({
					...parameters,
					isUserCallCommand,
					args,
					commandName,
					getLang: getText2
				})
					.then(async (handler) => {
						if (typeof handler == "function") {
							if (await isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
								return;
							try {
								await sleep(DELAY_TIME); // ADDED DELAY before handler execution
								await handler();
								log.info("onFirstChat", `${commandName} | ${userData.name} | ${senderID} | ${threadID} | ${args.join(" ")}`);
							}
							catch (err) {
								await sleep(DELAY_TIME); // ADDED DELAY
								await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred2", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
							}
						}
					})
					.catch(err => {
						log.err("onFirstChat", `An error occurred when calling the command onFirstChat ${commandName}`, err);
					});
			}
		}

		/*
		 +------------------------------------------------+
		 |                    ON REPLY                    |
		 +------------------------------------------------+
		*/
		async function onReply() {
			if (!event.messageReply)
				return;
			const { onReply } = GoatBot;
			const Reply = onReply.get(event.messageReply.messageID);
			if (!Reply)
				return;
			Reply.delete = () => onReply.delete(messageID);
			const commandName = Reply.commandName;
			if (!commandName) {
				await sleep(DELAY_TIME); // ADDED DELAY
				message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "cannotFindCommandName"));
				return log.err("onReply", "Can't find command name to execute this reply!", Reply);
			}
			const command = GoatBot.commands.get(commandName);
			if (!command) {
				await sleep(DELAY_TIME); // ADDED DELAY
				message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "cannotFindCommand", commandName));
				return log.err("onReply", `Command "${commandName}" not found`, Reply);
			}

			// —————————————— CHECK PERMISSION —————————————— //
			const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
			const needRole = roleConfig.onReply;
			if (needRole > role) {
				if (!hideNotiMessage.needRoleToUseCmdOnReply) {
					if (needRole == 1) {
						await sleep(DELAY_TIME); // ADDED DELAY
						return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminToUseOnReply", commandName));
					}
					else if (needRole == 2) {
						await sleep(DELAY_TIME); // ADDED DELAY
						return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBot2ToUseOnReply", commandName));
					}
				}
				else {
					return true;
				}
			}

			const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
			const time = getTime("DD/MM/YYYY HH:mm:ss");
			try {
				if (!command)
					throw new Error(`Cannot find command with commandName: ${commandName}`);
				const args = body ? body.split(/ +/) : [];
				createMessageSyntaxError(commandName);
				if (await isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
					return;
				await sleep(DELAY_TIME); // ADDED DELAY before onReply execution
				await command.onReply({
					...parameters,
					Reply,
					args,
					commandName,
					getLang: getText2
				});
				log.info("onReply", `${commandName} | ${userData.name} | ${senderID} | ${threadID} | ${args.join(" ")}`);
			}
			catch (err) {
				log.err("onReply", `An error occurred when calling the command onReply ${commandName}`, err);
				await sleep(DELAY_TIME); // ADDED DELAY
				await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred3", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
			}
		}

		/*
		 +------------------------------------------------+
		 |                   ON REACTION                  |
		 +------------------------------------------------+
		*/
		async function onReaction() {
			const { onReaction } = GoatBot;
			const Reaction = onReaction.get(messageID);
			if (!Reaction)
				return;
			Reaction.delete = () => onReaction.delete(messageID);
			const commandName = Reaction.commandName;
			if (!commandName) {
				await sleep(DELAY_TIME); // ADDED DELAY
				message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "cannotFindCommandName"));
				return log.err("onReaction", "Can't find command name to execute this reaction!", Reaction);
			}
			const command = GoatBot.commands.get(commandName);
			if (!command) {
				await sleep(DELAY_TIME); // ADDED DELAY
				message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "cannotFindCommand", commandName));
				return log.err("onReaction", `Command "${commandName}" not found`, Reaction);
			}

			// —————————————— CHECK PERMISSION —————————————— //
			const roleConfig = getRoleConfig(utils, command, isGroup, threadData, commandName);
			const needRole = roleConfig.onReaction;
			if (needRole > role) {
				if (!hideNotiMessage.needRoleToUseCmdOnReaction) {
					if (needRole == 1) {
						await sleep(DELAY_TIME); // ADDED DELAY
						return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminToUseOnReaction", commandName));
					}
					else if (needRole == 2) {
						await sleep(DELAY_TIME); // ADDED DELAY
						return await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "onlyAdminBot2ToUseOnReaction", commandName));
					}
				}
				else {
					return true;
				}
			}
			// —————————————————————————————————————————————— //

			const time = getTime("DD/MM/YYYY HH:mm:ss");
			try {
				if (!command)
					throw new Error(`Cannot find command with commandName: ${commandName}`);
				const getText2 = createGetText2(langCode, `${process.cwd()}/languages/cmds/${langCode}.js`, prefix, command);
				const args = [];
				createMessageSyntaxError(commandName);
				if (await isBannedOrOnlyAdmin(userData, threadData, senderID, threadID, isGroup, commandName, message, langCode))
					return;
				await sleep(DELAY_TIME); // ADDED DELAY before onReaction execution
				await command.onReaction({
					...parameters,
					Reaction,
					args,
					commandName,
					getLang: getText2
				});
				log.info("onReaction", `${commandName} | ${userData.name} | ${senderID} | ${threadID} | ${event.reaction}`);
			}
			catch (err) {
				log.err("onReaction", `An error occurred when calling the command onReaction ${commandName}`, err);
				await sleep(DELAY_TIME); // ADDED DELAY
				await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred4", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
			}
		}

		/*
		 +------------------------------------------------+
		 |                 EVENT COMMAND                  |
		 +------------------------------------------------+
		*/
		async function handlerEvent() {
			const { author } = event;
			const allEventCommand = GoatBot.eventCommands.entries();
			for (const [key] of allEventCommand) {
				const getEvent = GoatBot.eventCommands.get(key);
				if (!getEvent)
					continue;
				const commandName = getEvent.config.name;
				const getText2 = createGetText2(langCode, `${process.cwd()}/languages/events/${langCode}.js`, prefix, getEvent);
				const time = getTime("DD/MM/YYYY HH:mm:ss");
				try {
					const handler = await getEvent.onStart({
						...parameters,
						commandName,
						getLang: getText2
					});
					if (typeof handler == "function") {
						await sleep(DELAY_TIME); // ADDED DELAY before handler execution
						await handler();
						log.info("EVENT COMMAND", `Event: ${commandName} | ${author} | ${userData.name} | ${threadID}`);
					}
				}
				catch (err) {
					log.err("EVENT COMMAND", `An error occurred when calling the command event ${commandName}`, err);
					await sleep(DELAY_TIME); // ADDED DELAY
					await message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred5", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
				}
			}
		}

		/*
		 +------------------------------------------------+
		 |                    ON EVENT                    |
		 +------------------------------------------------+
		*/
		async function onEvent() {
			const allOnEvent = GoatBot.onEvent || [];
			const args = [];
			const { author } = event;
			for (const key of allOnEvent) {
				if (typeof key !== "string")
					continue;
				const command = GoatBot.commands.get(key);
				if (!command)
					continue;
				const commandName = command.config.name;
				const time = getTime("DD/MM/YYYY HH:mm:ss");
				createMessageSyntaxError(commandName);

				const getText2 = createGetText2(langCode, `${process.cwd()}/languages/events/${langCode}.js`, prefix, command);

				if (getType(command.onEvent) == "Function") {
					const defaultOnEvent = command.onEvent;
					// convert to AsyncFunction
					command.onEvent = async function () {
						return defaultOnEvent(...arguments);
					};
				}

				command.onEvent({
					...parameters,
					args,
					commandName,
					getLang: getText2
				})
					.then(async (handler) => {
						if (typeof handler == "function") {
							try {
								await sleep(DELAY_TIME); // ADDED DELAY before handler execution
								await handler();
								log.info("onEvent", `${commandName} | ${author} | ${userData.name} | ${threadID}`);
							}
							catch (err) {
								await sleep(DELAY_TIME); // ADDED DELAY
								message.reply(utils.getText({ lang: langCode, head: "handlerEvents" }, "errorOccurred6", time, commandName, removeHomeDir(err.stack ? err.stack.split("\n").slice(0, 5).join("\n") : JSON.stringify(err, null, 2))));
								log.err("onEvent", `An error occurred when calling the command onEvent ${commandName}`, err);
							}
						}
					})
					.catch(err => {
						log.err("onEvent", `An error occurred when calling the command onEvent ${commandName}`, err);
					});
			}
		}

		/*
		 +------------------------------------------------+
		 |                    PRESENCE                    |
		 +------------------------------------------------+
		*/
		async function presence() {
			// Your code here
		}

		/*
		 +------------------------------------------------+
		 |                  READ RECEIPT                  |
		 +------------------------------------------------+
		*/
		async function read_receipt() {
			// Your code here
		}

		/*
		 +------------------------------------------------+
		 |                   		 TYP                    	|
		 +------------------------------------------------+
		*/
		async function typ() {
			// Your code here
		}

		return {
			onAnyEvent,
			onFirstChat,
			onChat,
			onStart,
			onReaction,
			onReply,
			onEvent,
			handlerEvent,
			presence,
			read_receipt,
			typ
		};
	};

};
