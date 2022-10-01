import axios from 'axios'
import { parse } from "node-html-parser";

const getUSD_milliyet = async (): Promise<number> => {
  try {
    const data = await axios.get('https://uzmanpara.milliyet.com.tr/dolar-kuru/')
    const root = parse(data.data)
    const price = root.querySelector('#usd_header_son_data')?.textContent

    return parseFloat(price?.replace(',', '.') || '0')
  } catch (error) {
    console.error('USD error', error)
    return 0
  }
}

const getUSD_bloomberght = async (): Promise<number> => {
  try {
    const data = await axios.get('https://www.bloomberght.com/doviz/dolar')
    const root = parse(data.data)
    const price = root.querySelector('span.LastPrice')?.textContent

    return parseFloat(price?.replace(',', '.') || '0')
  } catch (error) {
    console.error('USD error', error)
    return 0
  }
}

const getBUSD = async (): Promise<number> => {
  try {
    const data = await axios.get('https://www.binance.com/api/v3/depth?symbol=BUSDTRY&limit=5')
    const price = data.data.asks[0][0]

    return parseFloat(price?.replace(',', '.') || '0')
  } catch (error) {
    console.error('BUSD error', error)
    return 0
  }
}

const getDifferece = (a: number, b: number) => {
  return Math.abs(a - b) / ((a + b) / 2) * 100
}

export const main = async (event: any, context: any) => {
  try {
    const busd = await getBUSD()
    const usd_milliyet = await getUSD_milliyet()
    const usd_bloomberght = await getUSD_bloomberght()
    const diff1 = getDifferece(busd, usd_milliyet)
    const diff2 = getDifferece(busd, usd_bloomberght)

    console.log('BUSD', busd)
    console.log('USD_milliyet',usd_milliyet, diff1)
    console.log('USD_bloomberght',usd_bloomberght, diff2)
    
    let res = { alarm: false }
    if (diff1 >= 2.0 || diff2 >= 2.0) res.alarm = true

    return {
      statusCode: 202,
      headers: {},
      body: JSON.stringify(res),
    }
  } catch (err) {
    return {
      statusCode: 200,
      headers: {},
      body: JSON.stringify({ err: err.message }),
    }
  }
}
