//setting
const setting = {
  rec: {
    SampleRate: 16000,
    ByteRate: 1536000,
    MinDataSize: 100000,
    duration: 1000
  },
  google: {
    keyfile: 'Key JSON',
    projectId: 'Project ID',
    MinText: 3
  },
  voicevox: {
    host: 'http://127.0.0.1:50021',
    TextSize: 40,
    speaker: 3
  },
  discord: {
    token: 'Your Discord Bot Token'
  },
  BingAi: {
    cookie: 'Your Cookie _U here'
  }
};

//ModuleImport
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { OpusEncoder } = require('@discordjs/opus');
const { createAudioResource, getVoiceConnection, joinVoiceChannel, createAudioPlayer, EndBehaviorType } = require('@discordjs/voice');
const WavConverter = require('wav-converter');
const speech = require('@google-cloud/speech');
const axios = require('axios');
const { ChatBot, conversation_style } = require('bingai-js');
const DiscordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates], rest: 60000
});

//変数設定
let waiting = false;

//GoogleClient設定
const GoogleClient = new speech.SpeechClient({
  projectId: setting.google.ProjectId,
  keyFilename: setting.google.KeyFileName
});
//BingAiApi設定
const BingAiApi = new ChatBot(setting.BingAi.cookie);


//functions
/**
 * @function DecodeOpus
 * @description Opus ストリームを PCM データに変換します
 * @param {OpusStream} OpusStream Opus ストリーム
 * @returns {Promise<ArrayBuffer>} PCM データの ArrayBuffer
 */
const DecodeOpus = async OpusStream => {
  return new Promise(resolve => {
    const opusDecoder = new OpusEncoder(setting.rec.SampleRate, 1, {
      bitrate: setting.rec.ByteRate,
    });
    const pcmData = opusDecoder.decode(OpusStream);
    resolve(pcmData);
  });
};

/**
 * @function RecordingDataProcessing
 * @description 録音データをWavに変換します。
 * @param {ReadableStream} stream 録音データのストリーム
 * @returns {Promise<Buffer>} 処理された録音データの Buffer
 *
 * @example
 * const stream = new ReadableStream();
 * const ProcessedData = await RecordingDataProcessing(stream);
 *
 * @see ReadableStream
 * @see WavConverter.encodeWav
 */
const RecordingDataProcessing = async stream => {
  const PcmDataArray = await Promise.all(stream);
  stream = [];
  const ConcatenatedBuffer = Buffer.concat(PcmDataArray);
  if (Buffer.from(ConcatenatedBuffer).length <= setting.rec.MinDataSize) return;
  const EncodeData = WavConverter.encodeWav(ConcatenatedBuffer, {
    numChannels: 1,
    sampleRate: setting.rec.SampleRate,
    byteRate: setting.rec.ByteRate
  });
  return EncodeData;
};

/**
 * @function GoogleSTT
 * @description Google Speech-to-Text APIを使用してWAVデータをテキストに変換します
 * @param {Buffer} WavData WAVデータ
 * @returns {Promise<string>} 変換されたテキスト
 *
 * @example
 * const wavData = fs.readFileSync('recording.wav');
 * const transcription = await GoogleSTT(wavData);
 *
 * @see GoogleClient.recognize
 * @see setting.google.MinText
 */
const GoogleSTT = async WavData => {
  const request = {
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: setting.rec.SampleRate,
      languageCode: 'ja-JP'
    },
    audio: {
      content: WavData
    }
  };
  const [response] = await GoogleClient.recognize(request);
  const transcription = response.results.map(result => result.alternatives[0].transcript).join('\n');
  if (transcription.length <= setting.google.MinText) return;
  return transcription;
};

/**
 * @function BingAi
 * @description Bing AI Chatbotを使用して、テキストを生成します
 * @param {string} transcript 入力テキスト
 * @returns {Promise<string>} 生成されたテキスト
 *
 * @example
 * const transcript = '今日はいい天気ですね。';
 * const text = await BingAi(transcript);
 *
 * @see BingAiApi.init
 * @see BingAiApi.ask
 * @see setting.voicevox.TextSize
 * @see exception_word
 */
const BingAi = async transcript => {
  await BingAiApi.init();
  const result = await BingAiApi.ask(`指示:日本語小さな女の子のように会話を返答してください。\n自己紹介はしないでそのまま回答してください。\n質問:${transcript}`, conversation_style.creative);
  const text = result.slice(0, setting.voicevox.TextSize);
  const exception_word = ['My mistake, I can’t give a response to t', 'Sorry! That’s on me, I can’t give a resp', 'Hmm…let’s try a different topic. Sorry a'];
  if (exception_word.includes(text.slice(0, 40))) return;
  return text;
};

/**
 * @function ReadData
 * @description VoiceVoxを使用して、テキストを音声に変換します。
 * @param {string} text 変換するテキスト。
 * @returns {Promise<Stream>} 変換された音声のストリーム。
 *
 * @example
 * const text = '今日はいい天気ですね。';
 * const stream = await ReadData(text);
 *
 * @see axios
 * @see setting.voicevox
 */
const ReadData = async text => {
  const audio_query = await axios.post(`${setting.voicevox.host}/audio_query?text=${text}&speaker=${setting.voicevox.speaker}`, {
    headers: { 'Content-Type': 'application/json' }
  });
  const synthesis_response = await axios.post(`${setting.voicevox.host}/synthesis?speaker=${setting.voicevox.speaker}`, audio_query.data, { headers: { 'Content-Type': 'application/json', 'accept': 'audio/wav' }, 'responseType': 'stream' });
  if (!synthesis_response.data) return;
  return synthesis_response.data;
};

/**
 * @function StopProcess
 * @description 処理を停止します
 * @param {string} text 停止のメッセージを表示します
 *
 * @example
 * const text = '処理を停止しました。';
 * await StopProcess(text);
 */
const StopProcess = async text => {
  waiting = false;
  console.log(text);
};

//DiscordClient
DiscordClient.once('ready', async () => {
  DiscordClient.user.setPresence({ activities: [{ name: `会話`, type: ActivityType.Streaming }] });
  await DiscordClient.application.commands.set([{ name: 'join', description: 'ボイスチャンネルに接続' }], '');
  console.log(`Logged in as ${DiscordClient.user.tag}`);
});

DiscordClient.on('interactionCreate', async interaction => {
  if (interaction.commandName === 'join') {
    const VoiceChannel = interaction.member.voice.channel;
    if (!VoiceChannel) return interaction.reply('ボイスチャンネルに接続してください');
    const connection = joinVoiceChannel({
      channelId: VoiceChannel.id,
      guildId: VoiceChannel.guild.id,
      adapterCreator: VoiceChannel.guild.voiceAdapterCreator
    });
    await interaction.reply('接続しました。');
    const player = createAudioPlayer();
    connection.subscribe(player);
    connection.receiver.speaking.on('start', userId => {
      let stream = [];
      const audio = connection.receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: setting.rec.duration
        }
      });
      //DataEvent
      audio.on('data', chunk => {
        const decodedChunk = DecodeOpus(chunk);
        stream.push(decodedChunk);
      });
      //EndEvent
      audio.on('end', async () => {
        //dicord(RecordingDataProcessing)
        if (waiting || !stream[0] || player.state.status === 'playing') return;
        waiting = true;
        console.log("録音データ処理開始");
        const WavData = await RecordingDataProcessing(stream);
        if (!WavData) return StopProcess('音声データ処理中断');
        console.log("録音データ処理完了");
        //GoogleSTT (voice=>text)
        console.log("文字化開始");
        const transcription = await GoogleSTT(WavData);
        if (!transcription) return StopProcess('文字化中断');
        console.log("文字化完了");
        //BingAi(text=>text)
        console.log('回答生成開始');
        const text = await BingAi(transcription);
        if (!text) return StopProcess('回答生成中断');
        console.log('回答生成完了');
        //VOICEVOX(text=>wavbase64)
        console.log("音声合成開始");
        const AudioData = await ReadData(text);
        if (!AudioData) return StopProcess('音声合成中断');
        console.log("音声合成完了");
        //discord(speak)
        const VoiceChannel = getVoiceConnection(interaction.guildId);
        if (!VoiceChannel) return waiting = false;
        const resource = createAudioResource(AudioData);
        player.play(resource);
        VoiceChannel.subscribe(player);
        audio.destroy();
        StopProcess('すべての処理完了');
      });
    });
  };
});


DiscordClient.login(setting.discord.token);

//例外処理
process.on('uncaughtException', error => {
  console.error(error);
});
