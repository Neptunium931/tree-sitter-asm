module.exports = grammar({
    name: 'asm',
    extras: $ => [
        / |\t|\r/,
        $.line_comment,
        $.block_comment,
    ],
conflicts: $ => [
        [
            $._expr,
            $._tc_expr,
        ],
        [
            $._ptr_expr,
            $.ptr,
        ],
        [
            $._ptr_expr,
        ],
    ],

    rules: {
        program: $ => repeatSep(repeat1('\n'), $._item),
        _item: $ =>
            choice(
                $.meta,
                $.label,
                $.const,
                $.instruction,
            ),

        meta: $ =>
            seq(
                field('kind', $.meta_ident),
                optional(choice(
                    seq(
                        $.ident, // macro name
                        optional(seq($.macro_arg_def, repeat(seq(',', $.macro_arg_def))))
                    ),
                    $.op_expr,
                    seq($.int, repeat(seq(',', $.int))),
                    seq($.float, repeat(seq(',', $.float))),
                    seq($.string, repeat(seq(',', $.string))),
                )),
            ),
        label: $ =>
            choice(
                seq(
                    choice($.meta_ident, alias($.word, $.ident), alias($._ident, $.ident)),
                    ':',
                    optional(choice(seq('(', $.ident, ')'), $.meta)),
                ),
                seq(
                    'label',
                    field('name', $.word),
                ),
            ),
        const: $ => seq('const', field('name', $.word), field('value', $._tc_expr)),
        instruction: $ => seq(field('kind', $.word), choice(repeatSep(',', $._expr), repeat($._tc_expr))),
        _expr: $ => choice($.ptr, $.ident, $.int, $.string, $.float, $.list, seq(choiceBetweenCase('offset'), $.word)),

        // ARMv7
        list: $ =>
            seq(
                '{',
                optional(seq($.reg, repeat(seq(choice(',', '-'), $.reg)), optional(','))),
                '}'
            ),

        _ptr_index_scale: $ =>
            choice(
                seq(
                    field('index', $.reg),
                    field('multiplication', '*'),
                    field('scale', $.scale),
                ),
                seq(
                    field('index', $.reg),
                ),
            ),
        _ptr_expr: $ =>
            choice(
                seq(
                    field('displacement', $.int),
                    choice('+', '-'),
                    field('base', $.reg),
                ),
                seq(
                    field('base', $.reg),
                    optional(field('displacement', $.int)),
                ),
                seq(
                    field('base', $.reg),
                    choice(
                        seq(
                            choice('+', '-'),
                            field('index', $.reg),
                            optional(seq('*', field('scale', $.scale))),
                        ),
                        seq(
                            choice('+', '-'),
                            field('displacement', $.int),
                        ),
                    ),
                ),
                seq(
                    field('index', $.reg),
                    optional(seq('*', field('scale', $.scale))),
                    choice('+', '-'),
                    field('base', $.reg),
                ),
                seq(
                    seq(field('index', $.reg), optional(seq('*', field('scale', $.scale)))),
                ),
                seq(
                    field('scale', $.scale),
                    '*',
                    field('index', $.reg),
                ),
                seq(
                    field('scale', $.scale),
                    '*',
                    field('index', $.reg),
                    choice('+', '-'),
                    field('base', $.reg),
                ),
            ),
        ptr: $ =>
            choice(
                // Intel
                seq(
                    optional($.size),
                    '[',
                    $._ptr_expr,
                    ']',
                ),
                // AT&T
                // DISP(BASE, INDEX, SCALE)
                seq(
                    field('disp', optional($.int)),
                    '(',
                    choice(
                      $.reg,
                      sep(',',
                        field('base', optional($.reg)),
                        field('index', $.reg),
                        field('scale', optional($.scale)),
                      ),
                    ),
                    ')',
                ),
                seq(
                    '*',
                    'rel',
                    '[',
                    $.int,
                    ']',
                ),
                // Aarch64
                seq(
                    '[',
                    $.reg,
                    optional(seq(',', $.int)),
                    ']',
                    optional('!'),
                ),
            ),
        // Turing Complete
        _tc_expr: $ =>
            choice(
                $.ident,
                $.int,
                $.string,
                $.tc_infix,
            ),
        tc_infix: $ =>
            choice(
                ...[
                    ['+', 0],
                    ['-', 0],
                    ['*', 1],
                    ['/', 1],
                    ['%', 1],
                    ['|', 2],
                    ['^', 3],
                    ['&', 4],
                ].map(([op, p]) =>
                    prec.left(
                        p,
                        seq(field('lhs', $._tc_expr), field('op', op), field('rhs', $._tc_expr)),
                    )
                ),
            ),

        int: $ => {
            const _int = /([0-9][0-9_]*|(0x|\$)[0-9A-Fa-f][0-9A-Fa-f_]*|0b[01][01_]*)/
            return choice(
                seq(optional(choice('#', '$')), optional($.prefix_operator), token.immediate(_int)),
                _int,
            )
        },
        float: $ => /-?[0-9][0-9_]*\.([0-9][0-9_]*)?/,
        string: $ =>
            choice(
                /"[^"]*"/,
                /'[^']*'/
            ),

        word: $ => /[a-zA-Z0-9_]+/,
        _reg: $ => /%?[a-z0-9]+/,
        address: $ => /[=\$][a-zA-Z0-9_]+/, // GAS x86 address
        reg: $ => choice($._reg, $.word, $.address, $.macro_arg),
        meta_ident: $ => /\.[a-z_]+/,
        _ident: $ => /[a-zA-Z_0-9.]+/,
        ident: $ => choice($._ident, $.meta_ident, $.reg),
        macro_arg_value: $ => choice($.int, $.float, $.string, $.ident),
        macro_arg_def: $ => seq($.ident, optional(seq("=", $.macro_arg_value))),
        macro_arg: $ => /\\[a-zA-Z0-9_]+/,
        prefix_operator: $ => /[~-]/,
        infix_operator: $ => /[\/%*<>|&^!+-]|<<|>>/,
        op_expr: $ => seq(
          field('lhs', $._expr),
          field('op', $.infix_operator),
          field('rhs', choice($._expr, $.op_expr)),
        ),
        scale: $ => prec(1, choice('1', '2', '4', '8', $.macro_arg)),
        size: $ => seq(choice('byte', 'word', 'dword', 'qword'), 'ptr'),

        line_comment: $ =>
            choice(
                seq('#', token.immediate(/.*/)),
                /(\/\/|;).*/,
            ),
        block_comment: $ =>
            token(seq(
                '/*',
                /[^*]*\*+([^/*][^*]*\*+)*/,
                '/',
            )),
    },
})

function repeatSep(separator, rule) {
    return optional(seq(rule, repeat(seq(separator, rule)), optional(separator)))
}
function choiceBetweenCase(...values) {
  return choice(
    ...values.flatMap(v => [String(v).toLowerCase(), String(v).toUpperCase()])
  );
}

function sep(separator, ...rules) {
  if (rules.length === 0) return optional();
  let parts = [rules[0]];
  for (let i = 1; i < rules.length; i++) {
    parts.push(separator, rules[i]);
  }
  return seq(...parts);
}
