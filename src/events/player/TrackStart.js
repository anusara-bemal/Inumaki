const Event = require("../../structures/Event.js");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");
const { trackStart } = require("../../utils/SetupSystem.js");

class TrackStart extends Event {
  constructor(client, file) {
    super(client, file, {
      name: "trackStart",
    });
  }
  async run(player, track, dispatcher) {
    const guild = this.client.guilds.cache.get(player.guildId);
    if (!guild) return;
    const channel = guild.channels.cache.get(dispatcher.channelId);
    if (!channel) return;

    function buttonBuilder() {
      const previousButton = new ButtonBuilder()
        .setCustomId("previous")
        .setEmoji("⏪")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(dispatcher.previous ? false : true);
      const resumeButton = new ButtonBuilder()
        .setCustomId("resume")
        .setEmoji(player.paused ? "▶️" : "⏸️")
        .setStyle(player.paused ? ButtonStyle.Success : ButtonStyle.Secondary);
      const stopButton = new ButtonBuilder()
        .setCustomId("stop")
        .setEmoji("⏹️")
        .setStyle(ButtonStyle.Danger);
      const skipButton = new ButtonBuilder()
        .setCustomId("skip")
        .setEmoji("⏩")
        .setStyle(ButtonStyle.Secondary);
      const loopButton = new ButtonBuilder()
        .setCustomId("loop")
        .setEmoji(dispatcher.loop === "repeat" ? "🔂" : "🔁")
        .setStyle(
          dispatcher.loop !== "off"
            ? ButtonStyle.Success
            : ButtonStyle.Secondary
        );
      return new ActionRowBuilder().addComponents(
        previousButton,
        resumeButton,
        stopButton,
        skipButton,
        loopButton
      );
    }
    const embed = this.client
      .embed()
      .setAuthor({
        name: "Now Playing",
        iconURL:
          this.client.config.icons[track.info.sourceName] ??
          this.client.user.displayAvatarURL({ extension: "png" }),
      })
      .setColor(this.client.color.main)
      .setDescription(`**[${track.info.title}](${track.info.uri})**`)
      .setFooter({
        text: `Requested by ${track.info.requester.tag}`,
        iconURL: track.info.requester.avatarURL({}),
      })
      .setThumbnail(track.info.artworkUrl)
      .addFields(
        {
          name: "Duration",
          value: track.info.isStream
            ? "LIVE"
            : this.client.utils.formatTime(track.info.length),
          inline: true,
        },
        { name: "Author", value: track.info.author, inline: true }
      )
      .setImage(
        "https://images-ext-1.discordapp.net/external/-1OCiWOIVM1sfEc0GmM4TBO8ZkC4XcLaADEoRuN3QlE/https/i.postimg.cc/XYFPkD8f/Media-220225-225641.gif")
      .setTimestamp();
    
    let setup = this.client.db.getSetup(guild.id);
    if (setup && setup.textId) {
      const textChannel = guild.channels.cache.get(setup.textId);
      const id = setup.messageId;
      if (!textChannel) return;
      if (channel && textChannel && channel.id === textChannel.id) {
        await trackStart(id, textChannel, dispatcher, track, this.client);
      } else {
        await trackStart(id, textChannel, dispatcher, track, this.client);
      }
    } else {
      const message = await channel.send({
        embeds: [embed],
        components: [buttonBuilder()],
      });
      dispatcher.nowPlayingMessage = message;
      const collector = message.createMessageComponentCollector({
        filter: async (b) => {
          if (
            b.guild.members.me.voice.channel &&
            b.guild.members.me.voice.channelId === b.member.voice.channelId
          )
            return true;
          else {
            b.reply({
              content: `You are not connected to <#${
                b.guild.members.me.voice?.channelId ?? "None"
              }> to use this buttons.`,
              ephemeral: true,
            });
            return false;
          }
        },
        //time: track.info.isStream ? 86400000 : track.info.length,
      });
      collector.on("collect", async (interaction) => {
        if (!(await checkDj(this.client, interaction))) {
          await interaction.reply({
            content: `You need to have the DJ role to use this command.`,
            ephemeral: true,
          });
          return;
        }
        switch (interaction.customId) {
          case "previous":
            if (!dispatcher.previous) {
              await interaction.reply({
                content: `There is no previous song.`,
                ephemeral: true,
              });
              return;
            } else dispatcher.previousTrack();
            if (message)
              await message.edit({
                embeds: [
                  embed.setFooter({
                    text: `Previous by ${interaction.user.tag}`,
                    iconURL: interaction.user.avatarURL({}),
                  }),
                ],
                components: [buttonBuilder()],
              });
            break;
          case "resume":
            dispatcher.pause();
            if (message)
              await message.edit({
                embeds: [
                  embed.setFooter({
                    text: `${player.paused ? "Paused" : "Resumed"} by ${
                      interaction.user.tag
                    }`,
                    iconURL: interaction.user.avatarURL({}),
                  }),
                ],
                components: [buttonBuilder()],
              });
            break;
          case "stop":
            dispatcher.stop();
            if (message)
              await message.edit({
                embeds: [
                  embed.setFooter({
                    text: `Stopped by ${interaction.user.tag}`,
                    iconURL: interaction.user.avatarURL({}),
                  }),
                ],
                components: [],
              });
            break;
          case "skip":
            if (!dispatcher.queue.length) {
              await interaction.reply({
                content: `There is no more song in the queue.`,
                ephemeral: true,
              });
              return;
            }
            dispatcher.skip();
            if (message)
              await message.edit({
                embeds: [
                  embed.setFooter({
                    text: `Skipped by ${interaction.user.tag}`,
                    iconURL: interaction.user.avatarURL({}),
                  }),
                ],
                components: [],
              });
            break;
          case "loop":
            switch (dispatcher.loop) {
              case "off":
                dispatcher.loop = "repeat";
                if (message)
                  await message.edit({
                    embeds: [
                      embed.setFooter({
                        text: `Looping by ${interaction.user.tag}`,
                        iconURL: interaction.user.avatarURL({}),
                      }),
                    ],
                    components: [buttonBuilder()],
                  });
                break;
              case "repeat":
                dispatcher.loop = "queue";
                if (message)
                  await message.edit({
                    embeds: [
                      embed.setFooter({
                        text: `Looping Queue by ${interaction.user.tag}`,
                        iconURL: interaction.user.avatarURL({}),
                      }),
                    ],
                    components: [buttonBuilder()],
                  });
                break;
              case "queue":
                dispatcher.loop = "off";
                if (message)
                  await message.edit({
                    embeds: [
                      embed.setFooter({
                        text: `Looping Off by ${interaction.user.tag}`,
                        iconURL: interaction.user.avatarURL({}),
                      }),
                    ],
                    components: [buttonBuilder()],
                  });
                break;
            }
            break;
        }
        await interaction.deferUpdate();
      });
    }
  }
}
async function checkDj(client, interaction) {
  const dj = await client.db.getDj(interaction.guildId);
  if (dj && dj.mode) {
    const djRole = await client.db.getRoles(interaction.guildId);
    if (!djRole) return false;
    const findDJRole = interaction.member.roles.cache.find((x) =>
      djRole.map((y) => y.roleId).includes(x.id)
    );
    if (!findDJRole) {
      if (
        !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
      ) {
        return false;
      }
    } else return true;
  }
  return true;
}

module.exports = { checkDj };

module.exports = TrackStart;
