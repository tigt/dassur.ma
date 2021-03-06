import { copyRegexp } from "./utils";
import { join } from "path";
import { parse, pack, isRenegadeFile } from "./renegade-helpers";

const defaultOpts = {
  baseDir: __dirname,
  chunkRegexp: /emitChunk\(([^)]+)\)/
};

export default function(opts = {}) {
  opts = Object.assign({}, defaultOpts, opts);
  return {
    name: "emit-plugin",
    async transform(code, _id) {
      if (!isRenegadeFile(code)) {
        return;
      }
      let { id, contents } = parse(code);
      contents = contents.map(async contentChunk => {
        if (contentChunk.type !== "string") {
          return contentChunk;
        }
        let remainingCode = contentChunk.value;
        const result = [];
        while (true) {
          const match = copyRegexp(opts.chunkRegexp).exec(remainingCode);
          if (!match) {
            result.push({ type: "string", value: remainingCode });
            break;
          }
          const originalImportId = match[1];
          let importId;
          if (originalImportId.startsWith("/")) {
            importId = join(opts.baseDir, "." + originalImportId);
          } else {
            importId = await this.resolveId("./" + originalImportId, id);
          }
          if (!importId) {
            throw Error(
              `Could not resolve "${originalImportId}" imported from ${id}"`
            );
          }
          const chunkRefId = this.emitChunk(importId);

          const prefix = remainingCode.slice(0, match.index);
          remainingCode = remainingCode.slice(match.index + match[0].length);
          result.push(
            ...[
              { type: "string", value: prefix },
              { type: "chunkRefId", chunkRefId, importId }
            ]
          );
        }
        return result;
      });
      contents = await Promise.all(contents);
      contents = contents.flat();
      return pack(id, contents);
    }
  };
}
