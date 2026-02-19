const fs = require("fs-extra");

const spamDataPath = "./spamData.json";
if (!fs.existsSync(spamDataPath)) fs.writeFileSync(spamDataPath, "{}");
let spamData = JSON.parse(fs.readFileSync(spamDataPath, "utf-8"));

const bannedUsersPath = "./bannedUsers.json";
if (!fs.existsSync(bannedUsersPath)) fs.writeFileSync(bannedUsersPath, "{}");
let bannedUsers = JSON.parse(fs.readFileSync(bannedUsersPath, "utf-8"));

function save() {
  fs.writeFileSync(spamDataPath, JSON.stringify(spamData, null, 2));
  fs.writeFileSync(bannedUsersPath, JSON.stringify(bannedUsers, null, 2));
}

module.exports = {
  config: {
    name: "spam",
    version: "1.0",
    author: "Muzan",
    category: "events"
  },

  // This runs on every message
  onChat: async ({ event, message, api }) => {
    const { senderID, body } = event;
    if (!body || !senderID) return;

    const now = Date.now();

    // ===== CHECK BAN STATUS =====
    if (bannedUsers[senderID]) {
      const remaining = bannedUsers[senderID] - now;
      if (remaining > 0) return; // ignore user completely
      else delete bannedUsers[senderID]; // unban after 1hr
      save();
    }

    // ===== INIT USER RECORD =====
    if (!spamData[senderID])
      spamData[senderID] = {
        lastMsg: "",
        lastTime: 0,
        repeatCount: 0,
        warned: false
      };

    const user = spamData[senderID];

    // Ignore if 7+ seconds since last message
    if (now - user.lastTime >= 7000) {
      user.lastMsg = body;
      user.repeatCount = 1;
      user.lastTime = now;
      user.warned = false;
      save();
      return;
    }

    // If same message within 7 seconds
    if (body === user.lastMsg) {
      user.repeatCount++;
      user.lastTime = now;

      // === First warning after 12 same msgs ===
      if (user.repeatCount === 12 && !user.warned) {
        user.warned = true;
        save();
        return message.reply(
          "⚠️ Warning: আপনি একই মেসেজ বারবার দিচ্ছেন!\nআর ১০ বার এই মেসেজ পাঠালে আপনাকে ১ ঘন্টার জন্য ব্যান করা হবে।"
        );
      }

      // === Ban after 22 total repeats ===
      if (user.repeatCount >= 22) {
        bannedUsers[senderID] = now + 60 * 60 * 1000; // 1 hour
        delete spamData[senderID];
        save();

        return message.reply(
          "🚫 আপনি বারবার স্প্যাম করার জন্য ১ ঘন্টার জন্য ব্যান হয়েছেন।\n১ ঘন্টা পর স্বয়ংক্রিয়ভাবে আনব্যান হবে।"
        );
      }
    } else {
      // Message changed → reset
      user.lastMsg = body;
      user.repeatCount = 1;
      user.lastTime = now;
      user.warned = false;
    }

    save();
  }
};
