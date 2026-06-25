const { toUtf8, fromUtf8 } = require('@smithy/util-utf8');
const { EventStreamCodec, MessageDecoderStream } = require('@smithy/eventstream-codec');
console.log('toUtf8:', typeof toUtf8);
console.log('fromUtf8:', typeof fromUtf8);
console.log('EventStreamCodec:', typeof EventStreamCodec);
console.log('MessageDecoderStream:', typeof MessageDecoderStream);
const codec = new EventStreamCodec(toUtf8, fromUtf8);
console.log('codec.decode:', typeof codec.decode);
