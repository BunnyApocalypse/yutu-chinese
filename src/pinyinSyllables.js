// The syllables of standard Mandarin, without tones, as pinyin writes them
// (with v for ü, as readTypedPinyin in dictionary.js gives the letters).
// About 410 of them: every word of Mandarin is made of these. Used to tell
// pinyin from text that only looks like it: "HSK 1", "Top 500", or
// Vietnamese "nhất" are not pinyin, since "hsk", "top" and "nhat" are no
// syllable. Written out from the usual table of pinyin syllables, and
// checked against every reading in CC-CEDICT (data/cedict/).

const BY_INITIAL = {
  '': 'a ai an ang ao e ei en eng er o ou',
  y: 'yi ya yao ye you yan yin yang ying yong yo yu yue yuan yun',
  w: 'wu wa wo wai wei wan wen wang weng',
  b: 'ba bo bai bei bao ban ben bang beng bi bie biao bian bin bing bu',
  p: 'pa po pai pei pao pou pan pen pang peng pi pie piao pian pin ping pu',
  m: 'ma mo me mai mei mao mou man men mang meng mi mie miao miu mian min ming mu',
  f: 'fa fo fei fou fan fen fang feng fu',
  d: 'da de dai dei dao dou dan den dang deng dong di dia die diao diu dian ding du duo dui duan dun',
  t: 'ta te tai tei tao tou tan tang teng tong ti tie tiao tian ting tu tuo tui tuan tun',
  n: 'na ne nai nei nao nou nan nen nang neng nong ni nie niao niu nian nin niang ning nu nuo nuan nun nv nve',
  l: 'la le lo lai lei lao lou lan lang leng long li lia lie liao liu lian lin liang ling lu luo luan lun lv lve',
  g: 'ga ge gai gei gao gou gan gen gang geng gong gu gua guo guai gui guan gun guang',
  k: 'ka ke kai kei kao kou kan ken kang keng kong ku kua kuo kuai kui kuan kun kuang',
  h: 'ha he hai hei hao hou han hen hang heng hong hu hua huo huai hui huan hun huang',
  j: 'ji jia jie jiao jiu jian jin jiang jing jiong ju jue juan jun',
  q: 'qi qia qie qiao qiu qian qin qiang qing qiong qu que quan qun',
  x: 'xi xia xie xiao xiu xian xin xiang xing xiong xu xue xuan xun',
  zh: 'zha zhe zhi zhai zhei zhao zhou zhan zhen zhang zheng zhong zhu zhua zhuo zhuai zhui zhuan zhun zhuang',
  ch: 'cha che chi chai chao chou chan chen chang cheng chong chu chua chuo chuai chui chuan chun chuang',
  sh: 'sha she shi shai shei shao shou shan shen shang sheng shu shua shuo shuai shui shuan shun shuang',
  r: 're ri rao rou ran ren rang reng rong ru rua ruo rui ruan run',
  z: 'za ze zi zai zei zao zou zan zen zang zeng zong zu zuo zui zuan zun',
  c: 'ca ce ci cai cao cou can cen cang ceng cong cu cuo cui cuan cun',
  s: 'sa se si sai sao sou san sen sang seng song su suo sui suan sun',
};

// Also: "lüe" and "nüe" written without the dots, as is common; the
// interjections m, n, ng, hm, hng; and r alone, as CC-CEDICT writes the
// 儿 of a word said with an r ("yi1 dian3 r5"); and biang, of biángbiáng
// noodles.
const OTHERS = 'lue nue m n ng hm hng r biang';

export const SYLLABLES = new Set([...Object.values(BY_INITIAL), OTHERS].join(' ').split(' '));

// Whether pinyin letters without tones or spaces ("yidianr", "xian") can be
// split into syllables of Mandarin, each perhaps with an r after it (the
// r of 一点儿, written "yīdiǎnr").
export function isSyllables(letters) {
  // canEnd[i]: the first i letters split into syllables.
  const canEnd = [true];
  for (let end = 1; end <= letters.length; end++) {
    canEnd[end] = false;
    for (let start = Math.max(0, end - 7); start < end && !canEnd[end]; start++) {
      if (!canEnd[start]) {
        continue;
      }
      const piece = letters.slice(start, end);
      canEnd[end] = SYLLABLES.has(piece) || (piece.endsWith('r') && SYLLABLES.has(piece.slice(0, -1)));
    }
  }
  return letters.length > 0 && canEnd[letters.length];
}
