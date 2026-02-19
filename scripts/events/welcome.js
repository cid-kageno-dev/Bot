const fs = require("fs-extra");
const { getTime, drive } = global.utils;

const approvedGCsPath = "./approvedGCs.json";
if (!fs.existsSync(approvedGCsPath)) fs.writeFileSync(approvedGCsPath, "[]");

if (!global.temp.welcomeEvent) global.temp.welcomeEvent = {};

module.exports = {
  config: {
    name: "welcome",
    version: "3.2",
    author: "Muzan",
    category: "events"
  },

  langs: {
    en: {
      session1: "🌅 Morning",
      session2: "🌞 Noon",
      session3: "🌇 Afternoon",
      session4: "🌙 Evening",
      welcomeMessage: "╭───────────────╮\n│  🎉  𝐁𝐎𝐓 𝐀𝐂𝐓𝐈𝐕𝐀𝐓𝐄𝐃  │\n╰───────────────╯\n✅ Approved by Muzan\n📛 Group: {boxName}\n🔑 Prefix: {prefix}\n💡 Use {prefix}help to view all commands.",
      multiple1: "you",
      multiple2: "you all",
      defaultWelcomeMessage:
        "╭───────────────╮\n│  💐  𝐍𝐄𝐖 𝐌𝐄𝐌𝐁𝐄𝐑 𝐉𝐎𝐈𝐍𝐄𝐃  │\n╰───────────────╯\n👤 {userName}\n🎉 Welcome to {boxName}!\n🌤️ Have a lovely {session}!",
      notApproved:
        "╭───────────────╮\n│  🔒  𝐔𝐍𝐀𝐏𝗣𝗥𝗢𝗩𝗘𝐃 𝐆𝐑𝐎𝐔𝐏  │\n╰───────────────╯\n🚫 | Sorry, this group isn’t approved by Muzan.\nBot will now leave..."
    }
  },

  onStart: async ({ threadsData, message, event, api, getLang }) => {
    if (event.logMessageType !== "log:subscribe") return;

    const { threadID } = event;
    const dataAdded = event.logMessageData.addedParticipants;

    // === Load approved GCs dynamically ===
    const approvedList = JSON.parse(fs.readFileSync(approvedGCsPath, "utf-8"));
    const approvedGCs = new Set(approvedList);

    // === BOT ADDED TO GROUP ===
    if (dataAdded.some(u => u.userFbId == api.getCurrentUserID())) {
      if (!approvedGCs.has(threadID)) {
        await message.send(getLang("notApproved"));
        return api.removeUserFromGroup(api.getCurrentUserID(), threadID);
      }

      const prefix = global.utils.getPrefix(threadID);
      const info = await api.getThreadInfo(threadID).catch(() => null);
      const boxName = info?.name || "Unknown Group";

      const welcomeMsg = getLang("welcomeMessage")
        .replace(/\{prefix\}/g, prefix)
        .replace(/\{boxName\}/g, boxName);

      return message.send(welcomeMsg);
    }

    // === NEW MEMBER JOIN ===
    if (!approvedGCs.has(threadID)) return; // ignore unapproved groups

    if (!global.temp.welcomeEvent[threadID])
      global.temp.welcomeEvent[threadID] = { joinTimeout: null, dataAddedParticipants: [] };

    const temp = global.temp.welcomeEvent[threadID];
    temp.dataAddedParticipants.push(...dataAdded);
    clearTimeout(temp.joinTimeout);

    temp.joinTimeout = setTimeout(async () => {
      const hours = getTime("HH");
      const threadData = await threadsData.get(threadID);
      if (threadData.settings.sendWelcomeMessage === false) return;

      const added = temp.dataAddedParticipants;
      const threadName = threadData.threadName;
      const userName = [];
      const mentions = [];
      let multiple = added.length > 1;

      for (const user of added) {
        userName.push(user.fullName);
        mentions.push({ tag: user.fullName, id: user.userFbId });
      }

      if (userName.length == 0) return;
      let { welcomeMessage = getLang("defaultWelcomeMessage") } = threadData.data;

      welcomeMessage = welcomeMessage
        .replace(/\{userName\}|\{userNameTag\}/g, userName.join(", "))
        .replace(/\{boxName\}|\{threadName\}/g, threadName)
        .replace(/\{multiple\}/g, multiple ? getLang("multiple2") : getLang("multiple1"))
        .replace(
          /\{session\}/g,
          hours <= 10
            ? getLang("session1")
            : hours <= 12
            ? getLang("session2")
            : hours <= 18
            ? getLang("session3")
            : getLang("session4")
        );

      const form = { body: welcomeMessage, mentions };

      if (threadData.data.welcomeAttachment) {
        const files = threadData.data.welcomeAttachment;
        const attachments = files.map(f => drive.getFile(f, "stream"));
        form.attachment = (await Promise.allSettled(attachments))
          .filter(x => x.status === "fulfilled")
          .map(x => x.value);
      }

      await message.send(form);
      delete global.temp.welcomeEvent[threadID];
    }, 1500);
  }
};
