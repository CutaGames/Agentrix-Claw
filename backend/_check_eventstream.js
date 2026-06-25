const m = require('@smithy/eventstream-codec');
console.log('Exports:', Object.keys(m).join(', '));
const codec = new m.EventStreamCodec(new (require('@smithy/util-utf8').toUtf8), new (require('@smithy/util-utf8').fromUtf8));
console.log('Codec methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(codec)).join(', '));
