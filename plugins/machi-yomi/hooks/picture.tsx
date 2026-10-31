import type { Elements, EngineInterface, ResolveInput } from 'claude-code'

import { imageCells, pictureSvg } from './art'

/** 取り込んだ画像：画面にそのまま埋め込む画像と、端末用の PNG。どちらも base64 */
export type Picture = { data: string; width: number; height: number; png?: string }

/** デスクトップなどで画像を描く高さ（CSS px） */
const SVG_HEIGHT = 120

/**
 * 画像を描く要素と、それが端末で取るマスの幅。出せなければ undefined。
 *
 * 端末は Image（PNG）、ほかの画面（デスクトップ・エディタ・モバイル）は画像を埋め込んだ Svg。
 * どちらを使うかは e.surface で決める：$.ui.resolve の表は全画面の要素名で埋められていて
 * （その画面にない要素は中身のない入れ物になる）、`'Image' in` では見分けられない
 */
export function pictureElement($: EngineInterface, e: ResolveInput, got: Picture, alt: string, key: string) {
  const elements = $.ui.resolve(e) as Partial<Elements['terminal'] & Elements['desktop']>
  if (e.surface === 'terminal') {
    const { Image } = elements
    if (!got.png || !Image) return undefined
    const size = imageCells(got.width, got.height)
    return { columns: size.columns, node: <Image key={key} source={{ png: got.png }} columns={size.columns} rows={size.rows} alt={alt} /> }
  }
  const { Svg } = elements
  const svg = pictureSvg(got.data)
  if (!Svg || !svg) return undefined
  const width = Math.round((got.width * SVG_HEIGHT) / got.height)
  return { columns: 0, node: <Svg source={svg} alt={alt} width={width} height={SVG_HEIGHT} /> }
}
