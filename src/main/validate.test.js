import { describe, expect, it } from 'vitest'
import { DEFAULT_FORWARD_HOST, sanitizeName, validatePassword, validateExec, validateForwards, validateHost, validateKeyPath, validateNode, validatePort, validateUser } from './validate.js'

describe('validate', () => {
  it('accepts normal values', () => {
    expect(validateHost(' example.com ')).toBe('example.com')
    expect(validateHost('192.168.0.1')).toBe('192.168.0.1')
    expect(validateHost('[fe80::1]')).toBe('[fe80::1]')
    expect(validateUser('deploy')).toBe('deploy')
    expect(validateUser('DOMAIN\\user.name')).toBe('DOMAIN\\user.name')
    expect(validatePort('22')).toBe('22')
    expect(validatePort(2222)).toBe('2222')
  })

  it.each([
    '-oProxyCommand=calc',
    'a b',
    "a'b",
    'a;b',
    'a\nb',
    '$(id)',
    ''
  ])('rejects host %j', value => {
    expect(() => validateHost(value)).toThrow()
  })

  it.each(['-l', 'a b', "a'b", '', 'a$(id)'])('rejects user %j', value => {
    expect(() => validateUser(value)).toThrow()
  })

  it.each(['0', '65536', '22a', '', ' ', '-1', '1e3', null, undefined])('rejects port %j', value => {
    expect(() => validatePort(value)).toThrow()
  })

  it('validates key path', () => {
    expect(validateKeyPath('')).toBe('')
    expect(validateKeyPath("C:\\Users\\o'brien\\.ssh\\id rsa")).toBe("C:\\Users\\o'brien\\.ssh\\id rsa")
    expect(() => validateKeyPath('a"b')).toThrow()
    expect(() => validateKeyPath('a\nb')).toThrow()
  })

  // 회귀: g 플래그 정규식의 lastIndex 때문에, 한 번 거부된 뒤에는 앞쪽 위치의 제어문자를 놓쳤다.
  it('rejects control characters every time, not only the first time', () => {
    // 같은 값을 두 번씩 넣는 것은 일부러다: 전역(g) 정규식의 lastIndex 때문에 두 번째 값이 통과하던 버그를 막는다.
    for (const value of ['aaaa\nbbbb', 'a\nb', 'a\nb', 'x\ry', '\u0000', 'ok\tno']) {
      expect(() => validateKeyPath(value), JSON.stringify(value)).toThrow()
    }
    expect(validateKeyPath('C:\\keys\\id_rsa')).toBe('C:\\keys\\id_rsa')
    expect(sanitizeName('a\nb\nc')).toBe('a b c')
    expect(sanitizeName('a\nb\nc')).toBe('a b c')
  })

  it('keeps passwords as they are', () => {
    expect(validatePassword(' a b ')).toBe(' a b ')
    expect(validatePassword(undefined)).toBe('')
    expect(() => validatePassword('a\nb')).toThrow()
    expect(() => validatePassword('a\u0000b')).toThrow()
    expect(() => validatePassword(123)).toThrow()
  })

  it('validates exec', () => {
    expect(validateExec(' cd /var/log; ls ')).toBe('cd /var/log; ls')
    expect(validateExec(undefined)).toBe('')
    expect(() => validateExec('a\u0000b')).toThrow()
  })

  describe('forwards', () => {
    it('defaults the target host to localhost', () => {
      expect(DEFAULT_FORWARD_HOST).toBe('localhost')
      expect(validateForwards([{ checked: true, from: '1', host: '', to: '2' }])[0].host).toBe('localhost')
      expect(validateForwards([{ checked: true, from: '1', host: null, to: '2' }])[0].host).toBe('localhost')
    })

    it('numbers errors like the list on screen and rejects incomplete or hostile rows', () => {
      const rows = [
        { checked: false, from: '', to: '' },
        { checked: true, from: '', to: '80' }
      ]
      expect(() => validateForwards(rows)).toThrow(/Local port \(forward 2\)/)
      expect(() => validateForwards([{ checked: true, from: '1', to: '' }])).toThrow(/Target port \(forward 1\)/)
      for (const host of ['-oProxyCommand=x', 'a b', "a'b", 'a;b', '$(id)']) {
        expect(() => validateForwards([{ checked: true, from: '1', host, to: '2' }]), host).toThrow(/target host \(forward 1\)/)
      }
    })

    it('rejects the same local port twice', () => {
      expect(() => validateForwards([
        { checked: true, from: '8080', to: '80' },
        { checked: true, from: '8080', host: 'other', to: '81' }
      ])).toThrow(/8080/)
      // 꺼진 항목은 겹쳐도 된다
      expect(validateForwards([
        { checked: true, from: '8080', to: '80' },
        { checked: false, from: '8080', to: '81' }
      ])).toHaveLength(1)
    })
  })

  it('validates node and forwards', () => {
    expect(validateNode({ name: 'a\nb', user: 'u', host: 'h', port: '22' }).name).toBe('a b')
    expect(() => validateNode(null)).toThrow()
    // 인증 정보(키/비밀번호)는 필수가 아니다. (ssh-agent, 기본 키, 터미널 입력)
    expect(validateNode({ user: 'u', host: 'h', port: '22' })).toMatchObject({ keyPath: '', password: '' })
    expect(validateNode({ user: 'u', host: 'h', port: '22', password: 'p w' }).password).toBe('p w')
    expect(validateNode({ host: 'h' }, { partial: true })).toMatchObject({ user: '', port: '' })
    expect(() => validateNode({ host: 'h' })).toThrow()
    expect(() => validateNode({ host: '', user: 'u', port: '1' }, { partial: true })).toThrow()

    expect(validateForwards([
      { checked: true, from: '8080', to: '80' },
      { checked: false, from: '1', to: '1' },
      { checked: true, from: '9090', host: ' db.internal ', to: '5432' }
    ])).toEqual([
      { from: '8080', host: 'localhost', to: '80' },
      { from: '9090', host: 'db.internal', to: '5432' }
    ])
    expect(() => validateForwards([])).toThrow()
    expect(validateForwards([], { allowEmpty: true })).toEqual([])
    expect(() => validateForwards([{ checked: true, from: 'x', to: '80' }])).toThrow()
  })
})
