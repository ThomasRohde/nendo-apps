"Sheets: a spreadsheet written in Smalltalk on Slip's morphs. A formula language with its own tokenizer, parser and syntax tree; a sheet that knows which cells depend on which and recalculates them in order, catching a circle; and a grid you edit with the mouse and the keys, with ranges, copy and paste that move the references, undo, and a formula bar. The sheet is kept in this file with Slip keep:as:, and a table of the file's records can be read into it. Open it with: SheetsApp open"!

Object subclass: #SheetToken
	instanceVariableNames: 'kind value position'
	classVariableNames: ''
	package: 'Sheets'!

Object subclass: #SheetLexer
	instanceVariableNames: 'source position'
	classVariableNames: ''
	package: 'Sheets'!

Error subclass: #SheetSyntaxError
	instanceVariableNames: 'position'
	classVariableNames: ''
	package: 'Sheets'!

Object subclass: #SheetParser
	instanceVariableNames: 'tokens index'
	classVariableNames: ''
	package: 'Sheets'!

Object subclass: #SheetNode
	instanceVariableNames: ''
	classVariableNames: ''
	package: 'Sheets'!

SheetNode subclass: #SheetLiteral
	instanceVariableNames: 'value'
	classVariableNames: ''
	package: 'Sheets'!

SheetNode subclass: #SheetCellRef
	instanceVariableNames: 'column row absoluteColumn absoluteRow'
	classVariableNames: ''
	package: 'Sheets'!

SheetNode subclass: #SheetRangeRef
	instanceVariableNames: 'from to'
	classVariableNames: ''
	package: 'Sheets'!

SheetNode subclass: #SheetUnaryOp
	instanceVariableNames: 'operator operand'
	classVariableNames: ''
	package: 'Sheets'!

SheetNode subclass: #SheetBinaryOp
	instanceVariableNames: 'operator left right'
	classVariableNames: ''
	package: 'Sheets'!

SheetNode subclass: #SheetCall
	instanceVariableNames: 'name arguments'
	classVariableNames: ''
	package: 'Sheets'!

Object subclass: #SheetErrorValue
	instanceVariableNames: 'code reason'
	classVariableNames: ''
	package: 'Sheets'!

Object subclass: #SheetFunctions
	instanceVariableNames: ''
	classVariableNames: ''
	package: 'Sheets'!

Object subclass: #SheetFormat
	instanceVariableNames: ''
	classVariableNames: ''
	package: 'Sheets'!

Object subclass: #SheetCell
	instanceVariableNames: 'source formula value precedents'
	classVariableNames: ''
	package: 'Sheets'!

Object subclass: #Sheet
	instanceVariableNames: 'cells dependents widths undoStack redoStack'
	classVariableNames: ''
	package: 'Sheets'!

Morph subclass: #SheetGridMorph
	instanceVariableNames: 'sheet app scroll anchor cursor editing editText caret dragging resizing clipboard'
	classVariableNames: ''
	package: 'Sheets'!

Morph subclass: #SheetMenuMorph
	instanceVariableNames: 'items action hover'
	classVariableNames: ''
	package: 'Sheets'!

Morph subclass: #SheetsApp
	instanceVariableNames: 'sheet grid buttons status statusUntil menu'
	classVariableNames: ''
	package: 'Sheets'!

SheetToken comment: 'One token of a formula: its kind (#number #string #ref #name #op #lparen #rparen #comma #colon #end), its value and where it starts.'!
SheetLexer comment: 'Cuts a formula''s text into SheetTokens. A reference is letters then digits, each part may be fixed with $ (B2, $B$2); a name is letters (SUM, TRUE).'!
SheetParser comment: 'A recursive-descent parser for formulas, from the loosest operator to the tightest: comparison, &, + and -, * and /, ^, unary minus, %, then a number, text, a reference or range, a function call or a parenthesis. It answers a tree of SheetNodes.'!
SheetNode comment: 'A node of a formula''s tree. It evaluates itself in a Sheet, names the cells it reads, prints itself back as formula text, and copies itself with its relative references moved, which is how a pasted formula follows its new place.'!
SheetErrorValue comment: 'An error a formula answers instead of a value: #DIV/0!!, #REF!!, #NAME?, #VALUE!!, #CIRC!! or #ERROR!!. It is a value like any other, so an IF can step around it, and a formula that reads it answers it in turn.'!
SheetFunctions comment: 'The functions a formula can call. A call to NAME runs the method fnNAME: with the arguments evaluated, a range as an Array of its values. Add one here and every sheet can call it.'!
SheetFormat comment: 'How a cell shows its value, and how its text is read: a number, text, TRUE or FALSE.'!
SheetCell comment: 'One cell: the text typed in it, the formula parsed from it, its value, and the cells its formula reads.'!
Sheet comment: 'The cells of a sheet by place (a Point, column @ row, from 1 @ 1 for A1), and for each cell the cells that read it. A change recalculates the cell and everything that depends on it in order; cells in a circle answer #CIRC!!. Every change can be undone.'!
SheetGridMorph comment: 'The grid: column and row headers, the cells, the selection and the cell being edited. It takes the mouse (click, drag, double click, the wheel, a column''s edge) and the keys (arrows, Enter, Tab, typing, Delete, F2, Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+X, Ctrl+V).'!
SheetMenuMorph comment: 'A short list to choose from, which evaluates its action with the item chosen.'!
SheetsApp comment: 'The Sheets window: a toolbar, the formula bar, the grid and a status line that sums the selection. SheetsApp open shows it in the World.'!

"---- Tokens"!

!SheetToken class methodsFor: 'instance creation'!
kind: aSymbol value: anObject position: anInteger
	^self new setKind: aSymbol value: anObject position: anInteger
! !

!SheetToken methodsFor: 'accessing'!
setKind: aSymbol value: anObject position: anInteger
	kind := aSymbol.
	value := anObject.
	position := anInteger
!
kind
	^kind
!
value
	^value
!
position
	^position
!
is: aSymbol
	^kind == aSymbol
!
isOp: aString
	^kind == #op and: [value = aString]
! !

!SheetToken methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: kind; nextPut: $(; print: value; nextPut: $)
! !

!SheetLexer class methodsFor: 'tokenizing'!
tokensOf: aString
	^self new setSource: aString; tokens
! !

!SheetLexer methodsFor: 'tokenizing'!
setSource: aString
	source := aString.
	position := 1
!
tokens
	| out token |
	out := OrderedCollection new.
	[token := self next. out add: token. token is: #end] whileFalse.
	^out asArray
!
next
	| c start |
	self skipSpaces.
	start := position.
	position > source size ifTrue: [^SheetToken kind: #end value: nil position: start].
	c := source at: position.
	(c isDigit or: [c = $. and: [self peekDigit]]) ifTrue: [^self number].
	c = $" ifTrue: [^self string].
	(c isLetter or: [c = $$]) ifTrue: [^self word].
	c = $( ifTrue: [^self single: #lparen].
	c = $) ifTrue: [^self single: #rparen].
	c = $, ifTrue: [^self single: #comma].
	c = $; ifTrue: [^self single: #comma].
	c = $: ifTrue: [^self single: #colon].
	^self operator
!
skipSpaces
	[position <= source size and: [(source at: position) isSeparator]] whileTrue: [position := position + 1]
!
peekDigit
	^position < source size and: [(source at: position + 1) isDigit]
!
single: aSymbol
	position := position + 1.
	^SheetToken kind: aSymbol value: (source at: position - 1) asString position: position - 1
!
number
	| start text |
	start := position.
	[position <= source size and: [(source at: position) isDigit]] whileTrue: [position := position + 1].
	(position <= source size and: [(source at: position) = $.]) ifTrue: [
		position := position + 1.
		[position <= source size and: [(source at: position) isDigit]] whileTrue: [position := position + 1]].
	text := source copyFrom: start to: position - 1.
	^SheetToken kind: #number value: (SheetFormat numberFrom: text) position: start
!
string
	| start out c |
	start := position.
	position := position + 1.
	out := WriteStream on: String new.
	[position > source size ifTrue: [^SheetSyntaxError new position: start; signal: 'The text that starts here has no closing quote.'].
	c := source at: position.
	position := position + 1.
	c = $" and: [position > source size or: [(source at: position) ~= $"]]] whileFalse: [
		out nextPut: c.
		c = $" ifTrue: [position := position + 1]].
	^SheetToken kind: #string value: out contents position: start
!
word
	| start text |
	start := position.
	[position <= source size and: [| c | c := source at: position. c isLetter or: [c isDigit or: [c = $$ or: [c = $_]]]]] whileTrue: [position := position + 1].
	text := (source copyFrom: start to: position - 1) asUppercase.
	(SheetCellRef isReference: text) ifTrue: [^SheetToken kind: #ref value: text position: start].
	(text includes: $$) ifTrue: [^SheetSyntaxError new position: start; signal: text , ' is not a cell reference.'].
	^SheetToken kind: #name value: text position: start
!
operator
	| start two one |
	start := position.
	two := position < source size ifTrue: [source copyFrom: position to: position + 1] ifFalse: [''].
	(#('<>' '<=' '>=') includes: two) ifTrue: [position := position + 2. ^SheetToken kind: #op value: two position: start].
	one := (source at: position) asString.
	(#('+' '-' '*' '/' '^' '&' '=' '<' '>' '%') includes: one) ifTrue: [position := position + 1. ^SheetToken kind: #op value: one position: start].
	^SheetSyntaxError new position: start; signal: 'A formula cannot use ' , one , '.'
! !

!SheetSyntaxError methodsFor: 'accessing'!
position
	^position
!
position: anInteger
	position := anInteger
! !

"---- The parser"!

!SheetParser class methodsFor: 'parsing'!
parse: aString
	"The tree of a formula's text, without its leading =."
	^self new setTokens: (SheetLexer tokensOf: aString); parseAll
! !

!SheetParser methodsFor: 'parsing'!
setTokens: anArray
	tokens := anArray.
	index := 1
!
peek
	^tokens at: index
!
advance
	index := index + 1.
	^tokens at: index - 1
!
expect: aSymbol saying: aString
	(self peek is: aSymbol) ifFalse: [^self fail: aString].
	^self advance
!
fail: aString
	^SheetSyntaxError new position: self peek position; signal: aString
!
parseAll
	| node |
	(self peek is: #end) ifTrue: [^self fail: 'The formula is empty.'].
	node := self comparison.
	(self peek is: #end) ifFalse: [^self fail: 'The formula goes on after its end: ' , self peek value printString , '.'].
	^node
!
comparison
	| node |
	node := self concatenation.
	[#('=' '<>' '<' '>' '<=' '>=') anySatisfy: [:op | self peek isOp: op]] whileTrue: [
		node := SheetBinaryOp operator: self advance value left: node right: self concatenation].
	^node
!
concatenation
	| node |
	node := self additive.
	[self peek isOp: '&'] whileTrue: [node := SheetBinaryOp operator: self advance value left: node right: self additive].
	^node
!
additive
	| node |
	node := self term.
	[(self peek isOp: '+') or: [self peek isOp: '-']] whileTrue: [
		node := SheetBinaryOp operator: self advance value left: node right: self term].
	^node
!
term
	| node |
	node := self power.
	[(self peek isOp: '*') or: [self peek isOp: '/']] whileTrue: [
		node := SheetBinaryOp operator: self advance value left: node right: self power].
	^node
!
power
	| node |
	node := self unary.
	[self peek isOp: '^'] whileTrue: [node := SheetBinaryOp operator: self advance value left: node right: self unary].
	^node
!
unary
	(self peek isOp: '-') ifTrue: [self advance. ^SheetUnaryOp operator: '-' operand: self unary].
	(self peek isOp: '+') ifTrue: [self advance. ^self unary].
	^self percent
!
percent
	| node |
	node := self primary.
	[self peek isOp: '%'] whileTrue: [self advance. node := SheetUnaryOp operator: '%' operand: node].
	^node
!
primary
	| token |
	token := self peek.
	(token is: #number) ifTrue: [^SheetLiteral value: self advance value].
	(token is: #string) ifTrue: [^SheetLiteral value: self advance value].
	(token is: #ref) ifTrue: [^self reference].
	(token is: #name) ifTrue: [^self nameOrCall].
	(token is: #lparen) ifTrue: [| node |
		self advance.
		node := self comparison.
		self expect: #rparen saying: 'A parenthesis is not closed.'.
		^node].
	(token is: #end) ifTrue: [^self fail: 'The formula ends too soon.'].
	^self fail: 'A value was expected, not ' , token value printString , '.'
!
reference
	| from |
	from := SheetCellRef fromText: self advance value.
	(self peek is: #colon) ifFalse: [^from].
	self advance.
	(self peek is: #ref) ifFalse: [^self fail: 'A range needs a cell after its colon.'].
	^SheetRangeRef from: from to: (SheetCellRef fromText: self advance value)
!
nameOrCall
	| name args |
	name := self advance value.
	(self peek is: #lparen) ifFalse: [
		name = 'TRUE' ifTrue: [^SheetLiteral value: true].
		name = 'FALSE' ifTrue: [^SheetLiteral value: false].
		^SheetLiteral value: (SheetErrorValue code: '#NAME?' reason: 'There is no name ' , name , '.')].
	self advance.
	args := OrderedCollection new.
	(self peek is: #rparen) ifFalse: [
		args add: self comparison.
		[self peek is: #comma] whileTrue: [self advance. args add: self comparison]].
	self expect: #rparen saying: name , '( is not closed.'.
	^SheetCall name: name arguments: args asArray
! !

"---- The tree"!

!SheetNode methodsFor: 'evaluating'!
evaluateIn: aSheet
	^self subclassResponsibility
!
referencesDo: aBlock
	"Evaluates aBlock with each cell place (a Point) this formula reads."
!
precedence
	"How tightly the node binds when printed; a looser child is put in parentheses."
	^10
! !

!SheetNode methodsFor: 'copying'!
shiftedBy: aPoint
	"A copy with the relative references moved by aPoint, as a formula pasted that far away."
	^self
! !

!SheetNode methodsFor: 'printing'!
formula
	"The node as formula text, with its leading =."
	^'=' , self printString
! !

!SheetLiteral class methodsFor: 'instance creation'!
value: anObject
	^self new setValue: anObject
! !

!SheetLiteral methodsFor: 'evaluating'!
setValue: anObject
	value := anObject
!
value
	^value
!
evaluateIn: aSheet
	^value
! !

!SheetLiteral methodsFor: 'printing'!
printOn: aStream
	value isString ifTrue: [
		aStream nextPut: $".
		value do: [:c | c = $" ifTrue: [aStream nextPut: $"]. aStream nextPut: c].
		^aStream nextPut: $"].
	value == true ifTrue: [^aStream nextPutAll: 'TRUE'].
	value == false ifTrue: [^aStream nextPutAll: 'FALSE'].
	value isSheetError ifTrue: [^aStream nextPutAll: (value code = '#NAME?' ifTrue: [(value reason copyReplaceAll: 'There is no name ' with: '') allButLast] ifFalse: [value code])].
	aStream nextPutAll: (SheetFormat sourceOf: value)
! !

!SheetCellRef class methodsFor: 'instance creation'!
column: aColumn row: aRow
	^self new setColumn: aColumn row: aRow absoluteColumn: false absoluteRow: false
!
fromText: aString
	"A reference from text such as B2, $B2 or $B$2."
	| i absCol letters absRow digits |
	i := 1.
	absCol := (aString at: i) = $$.
	absCol ifTrue: [i := i + 1].
	letters := WriteStream on: String new.
	[i <= aString size and: [(aString at: i) isLetter]] whileTrue: [letters nextPut: (aString at: i). i := i + 1].
	absRow := i <= aString size and: [(aString at: i) = $$].
	absRow ifTrue: [i := i + 1].
	digits := aString copyFrom: i to: aString size.
	^self new setColumn: (Sheet columnIndex: letters contents) row: digits asNumber absoluteColumn: absCol absoluteRow: absRow
!
isReference: aString
	"Whether aString reads as a cell reference: letters, then digits, either one fixed with $."
	| i letters digits |
	i := 1.
	(i <= aString size and: [(aString at: i) = $$]) ifTrue: [i := i + 1].
	letters := 0.
	[i <= aString size and: [(aString at: i) isLetter]] whileTrue: [letters := letters + 1. i := i + 1].
	(letters between: 1 and: 3) ifFalse: [^false].
	(i <= aString size and: [(aString at: i) = $$]) ifTrue: [i := i + 1].
	digits := 0.
	[i <= aString size and: [(aString at: i) isDigit]] whileTrue: [digits := digits + 1. i := i + 1].
	^(digits between: 1 and: 6) and: [i > aString size and: [((aString copyFrom: aString size - digits + 1 to: aString size) asNumber) > 0]]
! !

!SheetCellRef methodsFor: 'accessing'!
setColumn: aColumn row: aRow absoluteColumn: colBoolean absoluteRow: rowBoolean
	column := aColumn.
	row := aRow.
	absoluteColumn := colBoolean.
	absoluteRow := rowBoolean
!
place
	^column @ row
!
column
	^column
!
row
	^row
! !

!SheetCellRef methodsFor: 'evaluating'!
evaluateIn: aSheet
	^aSheet valueAt: self place
!
referencesDo: aBlock
	aBlock value: self place
! !

!SheetCellRef methodsFor: 'copying'!
shiftedBy: aPoint
	| c r |
	c := absoluteColumn ifTrue: [column] ifFalse: [column + aPoint x].
	r := absoluteRow ifTrue: [row] ifFalse: [row + aPoint y].
	(c < 1 or: [r < 1]) ifTrue: [^SheetLiteral value: SheetErrorValue badReference].
	^self class new setColumn: c row: r absoluteColumn: absoluteColumn absoluteRow: absoluteRow
! !

!SheetCellRef methodsFor: 'printing'!
printOn: aStream
	absoluteColumn ifTrue: [aStream nextPut: $$].
	aStream nextPutAll: (Sheet columnName: column).
	absoluteRow ifTrue: [aStream nextPut: $$].
	aStream print: row
! !

!SheetRangeRef class methodsFor: 'instance creation'!
from: fromRef to: toRef
	^self new setFrom: fromRef to: toRef
! !

!SheetRangeRef methodsFor: 'evaluating'!
setFrom: fromRef to: toRef
	from := fromRef.
	to := toRef
!
topLeft
	^(from column min: to column) @ (from row min: to row)
!
bottomRight
	^(from column max: to column) @ (from row max: to row)
!
placesDo: aBlock
	| a b |
	a := self topLeft.
	b := self bottomRight.
	a y to: b y do: [:r | a x to: b x do: [:c | aBlock value: c @ r]]
!
evaluateIn: aSheet
	"A range is the Array of its values, row by row; a function takes it as a list."
	| out |
	out := OrderedCollection new.
	self placesDo: [:place | out add: (aSheet valueAt: place)].
	^out asArray
!
referencesDo: aBlock
	self placesDo: aBlock
! !

!SheetRangeRef methodsFor: 'copying'!
shiftedBy: aPoint
	| a b |
	a := from shiftedBy: aPoint.
	b := to shiftedBy: aPoint.
	((a isKindOf: SheetCellRef) and: [b isKindOf: SheetCellRef]) ifFalse: [^SheetLiteral value: SheetErrorValue badReference].
	^self class from: a to: b
! !

!SheetRangeRef methodsFor: 'printing'!
printOn: aStream
	aStream print: from; nextPut: $:; print: to
! !

!SheetUnaryOp class methodsFor: 'instance creation'!
operator: aString operand: aNode
	^self new setOperator: aString operand: aNode
! !

!SheetUnaryOp methodsFor: 'evaluating'!
setOperator: aString operand: aNode
	operator := aString.
	operand := aNode
!
evaluateIn: aSheet
	| x |
	x := SheetFormat number: (operand evaluateIn: aSheet).
	x isSheetError ifTrue: [^x].
	operator = '%' ifTrue: [^x / 100].
	^x negated
!
referencesDo: aBlock
	operand referencesDo: aBlock
!
precedence
	^operator = '%' ifTrue: [8] ifFalse: [7]
! !

!SheetUnaryOp methodsFor: 'copying'!
shiftedBy: aPoint
	^self class operator: operator operand: (operand shiftedBy: aPoint)
! !

!SheetUnaryOp methodsFor: 'printing'!
printOn: aStream
	| wrap |
	wrap := operand precedence < self precedence.
	operator = '-' ifTrue: [aStream nextPut: $-].
	wrap ifTrue: [aStream nextPut: $(].
	aStream print: operand.
	wrap ifTrue: [aStream nextPut: $)].
	operator = '%' ifTrue: [aStream nextPut: $%]
! !

!SheetBinaryOp class methodsFor: 'instance creation'!
operator: aString left: leftNode right: rightNode
	^self new setOperator: aString left: leftNode right: rightNode
! !

!SheetBinaryOp methodsFor: 'evaluating'!
setOperator: aString left: leftNode right: rightNode
	operator := aString.
	left := leftNode.
	right := rightNode
!
evaluateIn: aSheet
	| a b |
	a := left evaluateIn: aSheet.
	a isSheetError ifTrue: [^a].
	b := right evaluateIn: aSheet.
	b isSheetError ifTrue: [^b].
	(a isArray or: [b isArray]) ifTrue: [^SheetErrorValue code: '#VALUE!!' reason: 'A range can only be given to a function.'].
	^self apply: a to: b
!
apply: a to: b
	| x y |
	operator = '&' ifTrue: [^(SheetFormat text: a) , (SheetFormat text: b)].
	(#('=' '<>' '<' '>' '<=' '>=') includes: operator) ifTrue: [^self compare: a with: b].
	x := SheetFormat number: a.
	x isSheetError ifTrue: [^x].
	y := SheetFormat number: b.
	y isSheetError ifTrue: [^y].
	operator = '+' ifTrue: [^x + y].
	operator = '-' ifTrue: [^x - y].
	operator = '*' ifTrue: [^x * y].
	operator = '/' ifTrue: [y = 0 ifTrue: [^SheetErrorValue divideByZero]. ^x / y].
	operator = '^' ifTrue: [(x = 0 and: [y < 0]) ifTrue: [^SheetErrorValue divideByZero]. ^x raisedTo: y].
	^SheetErrorValue code: '#ERROR!!' reason: 'There is no operator ' , operator , '.'
!
compare: a with: b
	| order |
	order := SheetFormat order: a with: b.
	operator = '=' ifTrue: [^order = 0].
	operator = '<>' ifTrue: [^order ~= 0].
	operator = '<' ifTrue: [^order < 0].
	operator = '>' ifTrue: [^order > 0].
	operator = '<=' ifTrue: [^order <= 0].
	^order >= 0
!
referencesDo: aBlock
	left referencesDo: aBlock.
	right referencesDo: aBlock
!
precedence
	(#('=' '<>' '<' '>' '<=' '>=') includes: operator) ifTrue: [^1].
	operator = '&' ifTrue: [^2].
	(operator = '+' or: [operator = '-']) ifTrue: [^3].
	(operator = '*' or: [operator = '/']) ifTrue: [^4].
	^5
! !

!SheetBinaryOp methodsFor: 'copying'!
shiftedBy: aPoint
	^self class operator: operator left: (left shiftedBy: aPoint) right: (right shiftedBy: aPoint)
! !

!SheetBinaryOp methodsFor: 'printing'!
printOn: aStream
	"Parentheses only where the tree needs them: a looser child, or an equal one on the right."
	(left precedence < self precedence) ifTrue: [aStream nextPut: $(; print: left; nextPut: $)] ifFalse: [aStream print: left].
	aStream nextPutAll: operator.
	(right precedence <= self precedence and: [right precedence < 10]) ifTrue: [aStream nextPut: $(; print: right; nextPut: $)] ifFalse: [aStream print: right]
! !

!SheetCall class methodsFor: 'instance creation'!
name: aString arguments: anArray
	^self new setName: aString arguments: anArray
! !

!SheetCall methodsFor: 'evaluating'!
setName: aString arguments: anArray
	name := aString.
	arguments := anArray
!
evaluateIn: aSheet
	| selector |
	selector := ('fn' , name , ':') asSymbol.
	(SheetFunctions new respondsTo: selector) ifFalse: [^SheetErrorValue code: '#NAME?' reason: 'There is no function ' , name , '.'].
	^SheetFunctions new perform: selector with: (arguments collect: [:each | each evaluateIn: aSheet])
!
referencesDo: aBlock
	arguments do: [:each | each referencesDo: aBlock]
! !

!SheetCall methodsFor: 'copying'!
shiftedBy: aPoint
	^self class name: name arguments: (arguments collect: [:each | each shiftedBy: aPoint])
! !

!SheetCall methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: name; nextPut: $(.
	arguments do: [:each | aStream print: each] separatedBy: [aStream nextPutAll: ', '].
	aStream nextPut: $)
! !

"---- Errors as values"!

!SheetErrorValue class methodsFor: 'instance creation'!
code: aString reason: reasonString
	^self new setCode: aString reason: reasonString
!
divideByZero
	^self code: '#DIV/0!!' reason: 'A division by zero.'
!
badReference
	^self code: '#REF!!' reason: 'The reference points off the sheet.'
!
circle
	^self code: '#CIRC!!' reason: 'The cell depends on itself, through the cells it reads.'
!
syntax: aString
	^self code: '#ERROR!!' reason: aString
! !

!SheetErrorValue methodsFor: 'accessing'!
setCode: aString reason: reasonString
	code := aString.
	reason := reasonString
!
code
	^code
!
reason
	^reason
!
isSheetError
	^true
!
= anObject
	^(anObject isKindOf: SheetErrorValue) and: [code = anObject code]
!
hash
	^code hash
! !

!SheetErrorValue methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: code
! !

!Object methodsFor: '*Sheets'!
isSheetError
	^false
! !

"---- Functions"!

!SheetFunctions methodsFor: 'helpers'!
flatten: args
	"The arguments with each range spread out."
	| out |
	out := OrderedCollection new.
	args do: [:each | each isArray ifTrue: [out addAll: each] ifFalse: [out add: each]].
	^out
!
numbersIn: args
	"The numbers among the arguments: a range skips its text and empty cells, as a spreadsheet does; an error stops it."
	| out |
	out := OrderedCollection new.
	args do: [:each |
		each isArray
			ifTrue: [each do: [:v | v isSheetError ifTrue: [^v]. v isNumber ifTrue: [out add: v]]]
			ifFalse: [| n | n := SheetFormat number: each. n isSheetError ifTrue: [^n]. out add: n]].
	^out
!
arity: anInteger of: args named: aString
	args size = anInteger ifFalse: [^SheetErrorValue code: '#VALUE!!' reason: aString , ' takes ' , anInteger printString , ' arguments.'].
	^nil
!
firstError: args
	^(self flatten: args) detect: [:each | each isSheetError] ifNone: [nil]
! !

!SheetFunctions methodsFor: 'math'!
fnSUM: args
	| ns |
	ns := self numbersIn: args.
	ns isSheetError ifTrue: [^ns].
	^ns inject: 0 into: [:a :b | a + b]
!
fnPRODUCT: args
	| ns |
	ns := self numbersIn: args.
	ns isSheetError ifTrue: [^ns].
	^ns inject: 1 into: [:a :b | a * b]
!
fnAVERAGE: args
	| ns |
	ns := self numbersIn: args.
	ns isSheetError ifTrue: [^ns].
	ns isEmpty ifTrue: [^SheetErrorValue divideByZero].
	^(self fnSUM: args) / ns size
!
fnMIN: args
	| ns |
	ns := self numbersIn: args.
	ns isSheetError ifTrue: [^ns].
	^ns isEmpty ifTrue: [0] ifFalse: [ns inject: ns first into: [:a :b | a min: b]]
!
fnMAX: args
	| ns |
	ns := self numbersIn: args.
	ns isSheetError ifTrue: [^ns].
	^ns isEmpty ifTrue: [0] ifFalse: [ns inject: ns first into: [:a :b | a max: b]]
!
fnMEDIAN: args
	| ns sorted mid |
	ns := self numbersIn: args.
	ns isSheetError ifTrue: [^ns].
	ns isEmpty ifTrue: [^SheetErrorValue code: '#VALUE!!' reason: 'MEDIAN needs a number.'].
	sorted := ns asSortedCollection asArray.
	mid := sorted size + 1 // 2.
	^sorted size odd ifTrue: [sorted at: mid] ifFalse: [(sorted at: mid) + (sorted at: mid + 1) / 2]
!
fnCOUNT: args
	^((self flatten: args) select: [:each | each isNumber]) size
!
fnCOUNTA: args
	^((self flatten: args) reject: [:each | each isNil or: [each = '']]) size
!
fnABS: args
	| x |
	(self arity: 1 of: args named: 'ABS') ifNotNil: [:e | ^e].
	x := SheetFormat number: args first.
	^x isSheetError ifTrue: [x] ifFalse: [x abs]
!
fnSQRT: args
	| x |
	(self arity: 1 of: args named: 'SQRT') ifNotNil: [:e | ^e].
	x := SheetFormat number: args first.
	x isSheetError ifTrue: [^x].
	x < 0 ifTrue: [^SheetErrorValue code: '#VALUE!!' reason: 'SQRT of a negative number.'].
	^x sqrt
!
fnROUND: args
	| x places scale |
	args isEmpty ifTrue: [^SheetErrorValue code: '#VALUE!!' reason: 'ROUND takes a number and the places to keep.'].
	x := SheetFormat number: args first.
	x isSheetError ifTrue: [^x].
	places := args size > 1 ifTrue: [SheetFormat number: (args at: 2)] ifFalse: [0].
	places isSheetError ifTrue: [^places].
	scale := 10 raisedTo: places truncated.
	^(x * scale) rounded / scale
!
fnMOD: args
	| x y |
	(self arity: 2 of: args named: 'MOD') ifNotNil: [:e | ^e].
	x := SheetFormat number: args first.
	y := SheetFormat number: (args at: 2).
	x isSheetError ifTrue: [^x].
	y isSheetError ifTrue: [^y].
	y = 0 ifTrue: [^SheetErrorValue divideByZero].
	^x \\ y
!
fnPOWER: args
	(self arity: 2 of: args named: 'POWER') ifNotNil: [:e | ^e].
	^(SheetBinaryOp operator: '^' left: (SheetLiteral value: args first) right: (SheetLiteral value: (args at: 2))) evaluateIn: nil
!
fnPI: args
	^Float pi
! !

!SheetFunctions methodsFor: 'logic'!
fnIF: args
	| test |
	(args size between: 2 and: 3) ifFalse: [^SheetErrorValue code: '#VALUE!!' reason: 'IF takes a test, a value and maybe another.'].
	args first isSheetError ifTrue: [^args first].
	test := SheetFormat truth: args first.
	test isSheetError ifTrue: [^test].
	^test ifTrue: [args at: 2] ifFalse: [args size = 3 ifTrue: [args at: 3] ifFalse: [false]]
!
fnAND: args
	| error |
	error := self firstError: args.
	error ifNotNil: [^error].
	^(self flatten: args) allSatisfy: [:each | (SheetFormat truth: each) == true]
!
fnOR: args
	| error |
	error := self firstError: args.
	error ifNotNil: [^error].
	^(self flatten: args) anySatisfy: [:each | (SheetFormat truth: each) == true]
!
fnNOT: args
	| t |
	(self arity: 1 of: args named: 'NOT') ifNotNil: [:e | ^e].
	t := SheetFormat truth: args first.
	^t isSheetError ifTrue: [t] ifFalse: [t not]
!
fnISERROR: args
	(self arity: 1 of: args named: 'ISERROR') ifNotNil: [:e | ^e].
	^args first isSheetError
!
fnIFERROR: args
	(self arity: 2 of: args named: 'IFERROR') ifNotNil: [:e | ^e].
	^args first isSheetError ifTrue: [args at: 2] ifFalse: [args first]
! !

!SheetFunctions methodsFor: 'text'!
fnCONCAT: args
	| error |
	error := self firstError: args.
	error ifNotNil: [^error].
	^(self flatten: args) inject: '' into: [:text :each | text , (SheetFormat text: each)]
!
fnLEN: args
	(self arity: 1 of: args named: 'LEN') ifNotNil: [:e | ^e].
	args first isSheetError ifTrue: [^args first].
	^(SheetFormat text: args first) size
!
fnUPPER: args
	(self arity: 1 of: args named: 'UPPER') ifNotNil: [:e | ^e].
	args first isSheetError ifTrue: [^args first].
	^(SheetFormat text: args first) asUppercase
!
fnLOWER: args
	(self arity: 1 of: args named: 'LOWER') ifNotNil: [:e | ^e].
	args first isSheetError ifTrue: [^args first].
	^(SheetFormat text: args first) asLowercase
! !

"---- Reading and showing values"!

!SheetFormat class methodsFor: 'reading'!
numberFrom: aString
	"The number aString reads as (12, -3.5, .5, 40%), or nil. A decimal is kept exact, as a Fraction."
	| text sign percent whole dot fraction |
	text := aString trimmed.
	text isEmpty ifTrue: [^nil].
	sign := 1.
	(text first = $-) ifTrue: [sign := -1. text := text allButFirst].
	(text notEmpty and: [text first = $+]) ifTrue: [text := text allButFirst].
	percent := text notEmpty and: [text last = $%].
	percent ifTrue: [text := text allButLast].
	text isEmpty ifTrue: [^nil].
	(text allSatisfy: [:c | c isDigit or: [c = $.]]) ifFalse: [^nil].
	(text occurrencesOf: $.) > 1 ifTrue: [^nil].
	text = '.' ifTrue: [^nil].
	dot := text indexOf: $..
	dot = 0
		ifTrue: [whole := text asNumber. fraction := 0]
		ifFalse: [
			whole := dot = 1 ifTrue: [0] ifFalse: [(text copyFrom: 1 to: dot - 1) asNumber].
			fraction := dot = text size
				ifTrue: [0]
				ifFalse: [(text copyFrom: dot + 1 to: text size) asNumber / (10 raisedTo: text size - dot)]].
	^percent ifTrue: [sign * (whole + fraction) / 100] ifFalse: [sign * (whole + fraction)]
!
valueOf: aString
	"What a cell's text stands for when it is not a formula: a number, TRUE, FALSE, text, or nil when empty. A leading ' keeps the rest as text."
	| upper |
	aString isEmpty ifTrue: [^nil].
	aString first = $' ifTrue: [^aString allButFirst].
	(self numberFrom: aString) ifNotNil: [:n | ^n].
	upper := aString trimmed asUppercase.
	upper = 'TRUE' ifTrue: [^true].
	upper = 'FALSE' ifTrue: [^false].
	^aString
!
number: aValue
	"aValue as a number for arithmetic: empty is 0, TRUE is 1, text that reads as a number is that number."
	aValue isNil ifTrue: [^0].
	aValue isNumber ifTrue: [^aValue].
	aValue == true ifTrue: [^1].
	aValue == false ifTrue: [^0].
	aValue isSheetError ifTrue: [^aValue].
	aValue isString ifTrue: [
		aValue isEmpty ifTrue: [^0].
		(self numberFrom: aValue) ifNotNil: [:n | ^n]].
	^SheetErrorValue code: '#VALUE!!' reason: (self text: aValue) printString , ' is not a number.'
!
truth: aValue
	aValue isNil ifTrue: [^false].
	(aValue == true or: [aValue == false]) ifTrue: [^aValue].
	aValue isNumber ifTrue: [^aValue ~= 0].
	aValue isSheetError ifTrue: [^aValue].
	aValue isString ifTrue: [
		aValue asUppercase = 'TRUE' ifTrue: [^true].
		aValue asUppercase = 'FALSE' ifTrue: [^false]].
	^SheetErrorValue code: '#VALUE!!' reason: (self text: aValue) printString , ' is not TRUE or FALSE.'
!
order: a with: b
	"-1, 0 or 1: numbers by size, text by letters with no regard to case; a number comes before text."
	| x y |
	x := a isNil ifTrue: [b isString ifTrue: [''] ifFalse: [0]] ifFalse: [a].
	y := b isNil ifTrue: [x isString ifTrue: [''] ifFalse: [0]] ifFalse: [b].
	x == true ifTrue: [x := 1]. x == false ifTrue: [x := 0].
	y == true ifTrue: [y := 1]. y == false ifTrue: [y := 0].
	(x isNumber and: [y isNumber]) ifTrue: [^x < y ifTrue: [-1] ifFalse: [x = y ifTrue: [0] ifFalse: [1]]].
	x isNumber ifTrue: [^-1].
	y isNumber ifTrue: [^1].
	x := x asString asLowercase.
	y := y asString asLowercase.
	^x < y ifTrue: [-1] ifFalse: [x = y ifTrue: [0] ifFalse: [1]]
! !

!SheetFormat class methodsFor: 'showing'!
text: aValue
	"aValue as a cell shows it."
	aValue isNil ifTrue: [^''].
	aValue isString ifTrue: [^aValue].
	aValue == true ifTrue: [^'TRUE'].
	aValue == false ifTrue: [^'FALSE'].
	aValue isNumber ifTrue: [^self decimal: aValue].
	^aValue printString
!
decimal: aNumber
	"aNumber with at most 6 decimals, its trailing zeros dropped: 1/3 shows 0.333333, 2.50 shows 2.5."
	| scale scaled whole part digits |
	aNumber isInteger ifTrue: [^aNumber printString].
	(aNumber isFloat and: [aNumber isNaN or: [aNumber isInfinite]]) ifTrue: [^aNumber printString].
	scale := 1000000.
	scaled := (aNumber * scale) rounded.
	whole := scaled abs // scale.
	part := scaled abs \\ scale.
	digits := part = 0 ifTrue: [''] ifFalse: [
		| text |
		text := part printPaddedWith: $0 to: 6.
		[text last = $0] whileTrue: [text := text allButLast].
		'.' , text].
	^(scaled < 0 ifTrue: ['-'] ifFalse: ['']) , whole printString , digits
!
sourceOf: aNumber
	"aNumber as formula text that reads back as the same number."
	^self decimal: aNumber
! !

"---- Cells and the sheet"!

!SheetCell class methodsFor: 'instance creation'!
source: aString
	^self new setSource: aString
! !

!SheetCell methodsFor: 'accessing'!
setSource: aString
	source := aString.
	precedents := #().
	(aString notEmpty and: [aString first = $=])
		ifTrue: [
			formula := [SheetParser parse: aString allButFirst] on: SheetSyntaxError do: [:e | e return: (SheetLiteral value: (SheetErrorValue syntax: e messageText))].
			precedents := Set new.
			formula referencesDo: [:place | precedents add: place].
			precedents := precedents asArray]
		ifFalse: [
			formula := nil.
			value := SheetFormat valueOf: aString]
!
source
	^source
!
formula
	^formula
!
isFormula
	^formula notNil
!
precedents
	"The places this cell's formula reads."
	^precedents
!
value
	^value
!
value: anObject
	value := anObject
!
recalculateIn: aSheet
	formula isNil ifTrue: [^self].
	value := formula evaluateIn: aSheet.
	value isArray ifTrue: [value := SheetErrorValue code: '#VALUE!!' reason: 'A range can only be given to a function.']
! !

!Sheet class methodsFor: 'places'!
columnName: anInteger
	"1 is A, 26 is Z, 27 is AA."
	| n name |
	n := anInteger.
	name := ''.
	[n > 0] whileTrue: [
		name := (Character codePoint: 65 + (n - 1 \\ 26)) asString , name.
		n := n - 1 // 26].
	^name
!
columnIndex: aString
	^aString asUppercase inject: 0 into: [:sum :c | sum * 26 + (c codePoint - 64)]
!
nameOf: aPoint
	^(self columnName: aPoint x) , aPoint y printString
!
placeOf: aString
	^(SheetCellRef fromText: aString asUppercase) place
! !

!Sheet methodsFor: 'initialization'!
initialize
	cells := Dictionary new.
	dependents := Dictionary new.
	widths := Dictionary new.
	undoStack := OrderedCollection new.
	redoStack := OrderedCollection new
! !

!Sheet methodsFor: 'reading'!
cellAt: aPoint
	^cells at: aPoint ifAbsent: [nil]
!
valueAt: aPoint
	^(cells at: aPoint ifAbsent: [^nil]) value
!
sourceAt: aPoint
	^(cells at: aPoint ifAbsent: [^'']) source
!
at: aString
	"The value of the cell named aString: sheet at: 'B2'."
	^self valueAt: (Sheet placeOf: aString)
!
places
	^cells keys
!
extent
	"The last column and row with something in them."
	^cells keys inject: 0 @ 0 into: [:max :each | max max: each]
!
widthOf: aColumn
	^widths at: aColumn ifAbsent: [96]
!
width: anInteger of: aColumn
	widths at: aColumn put: ((anInteger max: 32) min: 600)
!
dependentsOf: aPoint
	^dependents at: aPoint ifAbsent: [#()]
! !

!Sheet methodsFor: 'changing'!
at: aString put: sourceString
	"Puts sourceString in the cell named aString, as a person typing it would: sheet at: 'B2' put: '=A1*2'."
	^self change: (Dictionary new at: (Sheet placeOf: aString) put: sourceString; yourself)
!
change: aDictionary
	"Puts each source in its place (an empty source clears the cell), recalculates what depends on them, and keeps the change for undo. Answers the places recalculated."
	| before |
	before := Dictionary new.
	aDictionary keysDo: [:place | before at: place put: (self sourceAt: place)].
	undoStack addLast: before -> aDictionary copy.
	redoStack := OrderedCollection new.
	^self apply: aDictionary
!
apply: aDictionary
	aDictionary keysAndValuesDo: [:place :text | self setSource: text at: place].
	^self recalculateFrom: aDictionary keys
!
setSource: aString at: aPoint
	| old cell |
	old := cells at: aPoint ifAbsent: [nil].
	old ifNotNil: [old precedents do: [:p | (dependents at: p ifAbsent: [Set new]) remove: aPoint ifAbsent: [nil]]].
	aString isEmpty ifTrue: [^cells removeKey: aPoint ifAbsent: [nil]].
	cell := SheetCell source: aString.
	cells at: aPoint put: cell.
	cell precedents do: [:p | (dependents at: p ifAbsent: [dependents at: p put: Set new]) add: aPoint]
!
undo
	| step |
	undoStack isEmpty ifTrue: [^false].
	step := undoStack removeLast.
	redoStack addLast: step.
	self apply: step key.
	^true
!
redo
	| step |
	redoStack isEmpty ifTrue: [^false].
	step := redoStack removeLast.
	undoStack addLast: step.
	self apply: step value.
	^true
!
forgetHistory
	undoStack := OrderedCollection new.
	redoStack := OrderedCollection new
!
canUndo
	^undoStack notEmpty
!
canRedo
	^redoStack notEmpty
! !

!Sheet methodsFor: 'recalculating'!
affectedBy: places
	"The places given and every formula that reads them, however far down."
	| seen work |
	seen := Set new.
	work := OrderedCollection withAll: places.
	[work isEmpty] whileFalse: [| place |
		place := work removeFirst.
		(seen includes: place) ifFalse: [
			seen add: place.
			work addAll: (self dependentsOf: place)]].
	^seen
!
recalculateFrom: places
	"Recalculates the affected formulas in an order where each comes after the cells it reads (Kahn's algorithm). A formula left over is in a circle, or reads one: it answers #CIRC!!."
	| affected waiting ready order |
	affected := self affectedBy: places.
	waiting := Dictionary new.
	affected do: [:place |
		(cells at: place ifAbsent: [nil]) ifNotNil: [:cell |
			waiting at: place put: (cell precedents select: [:p | (affected includes: p) and: [cells includesKey: p]]) size]].
	ready := OrderedCollection withAll: (waiting keys select: [:place | (waiting at: place) = 0]).
	order := OrderedCollection new.
	[ready isEmpty] whileFalse: [| place |
		place := ready removeFirst.
		order add: place.
		waiting removeKey: place.
		(self dependentsOf: place) do: [:d |
			(waiting includesKey: d) ifTrue: [
				waiting at: d put: (waiting at: d) - 1.
				(waiting at: d) = 0 ifTrue: [ready add: d]]]].
	order do: [:place | (cells at: place) recalculateIn: self].
	waiting keysDo: [:place | (cells at: place) value: SheetErrorValue circle].
	^affected
!
recalculateAll
	^self recalculateFrom: cells keys
! !

!Sheet methodsFor: 'keeping'!
state
	"What is kept: each cell's text by its name, and the widths that are not the default."
	| sources sized |
	sources := Dictionary new.
	cells keysAndValuesDo: [:place :cell | sources at: (Sheet nameOf: place) put: cell source].
	sized := Dictionary new.
	widths keysAndValuesDo: [:column :width | sized at: (Sheet columnName: column) put: width].
	^Dictionary new at: 'cells' put: sources; at: 'widths' put: sized; yourself
!
state: aDictionary
	| sources |
	self initialize.
	sources := aDictionary at: 'cells' ifAbsent: [Dictionary new].
	sources keysAndValuesDo: [:name :text | self setSource: text at: (Sheet placeOf: name)].
	(aDictionary at: 'widths' ifAbsent: [Dictionary new]) keysAndValuesDo: [:name :width | widths at: (Sheet columnIndex: name) put: width].
	self recalculateAll
! !

!Sheet methodsFor: 'records'!
readRecords: entityId
	"Fills the sheet with the file's records of entityId: one column for each field, a header row, then a row for each record. It replaces what was there, as one change that can be undone."
	| records fields change |
	records := Nendo records: entityId.
	fields := (records inject: Set new into: [:set :r | set addAll: r values keys. set]) asSortedCollection asArray.
	change := Dictionary new.
	cells keysDo: [:place | change at: place put: ''].
	fields doWithIndex: [:field :c | change at: c @ 1 put: (field copyReplaceAll: entityId , '.' with: '')].
	records doWithIndex: [:record :r |
		fields doWithIndex: [:field :c | | v |
			v := record values at: field ifAbsent: [nil].
			change at: c @ (r + 1) put: (self sourceFor: v)]].
	self change: change.
	^records size
!
sourceFor: aValue
	"The text a value from a record is typed as."
	aValue isNil ifTrue: [^''].
	aValue isNumber ifTrue: [^SheetFormat text: aValue].
	(aValue == true or: [aValue == false]) ifTrue: [^SheetFormat text: aValue].
	aValue isArray ifTrue: [^'''' , ((aValue collect: [:each | SheetFormat text: each]) inject: '' into: [:a :b | a isEmpty ifTrue: [b] ifFalse: [a , ', ' , b]])].
	^(aValue isString and: [aValue notEmpty and: [aValue first = $= or: [(SheetFormat numberFrom: aValue) notNil]]])
		ifTrue: ['''' , aValue]
		ifFalse: [aValue asString]
! !

!Sheet class methodsFor: 'examples'!
example
	"A small budget that shows the formulas off."
	| sheet |
	sheet := self new.
	sheet change: (Dictionary new
		at: 1 @ 1 put: 'Item'; at: 2 @ 1 put: 'Qty'; at: 3 @ 1 put: 'Price'; at: 4 @ 1 put: 'Total';
		at: 1 @ 2 put: 'Coffee beans'; at: 2 @ 2 put: '3'; at: 3 @ 2 put: '12.50'; at: 4 @ 2 put: '=B2*C2';
		at: 1 @ 3 put: 'Notebooks'; at: 2 @ 3 put: '5'; at: 3 @ 3 put: '4.20'; at: 4 @ 3 put: '=B3*C3';
		at: 1 @ 4 put: 'Smalltalk book'; at: 2 @ 4 put: '1'; at: 3 @ 4 put: '39'; at: 4 @ 4 put: '=B4*C4';
		at: 1 @ 5 put: 'Desk lamp'; at: 2 @ 5 put: '2'; at: 3 @ 5 put: '24.95'; at: 4 @ 5 put: '=B5*C5';
		at: 1 @ 7 put: 'Sum'; at: 4 @ 7 put: '=SUM(D2:D5)';
		at: 1 @ 8 put: 'With tax'; at: 3 @ 8 put: '25%'; at: 4 @ 8 put: '=D7*(1+C8)';
		at: 1 @ 9 put: 'Dearest'; at: 4 @ 9 put: '=MAX(D2:D5)';
		at: 1 @ 10 put: 'Verdict'; at: 4 @ 10 put: '=IF(D8>150, "Over budget", "Fine")';
		at: 6 @ 1 put: 'Try: change a Qty, type =D8/0, or =A1 in A1.';
		yourself).
	sheet width: 140 of: 1.
	sheet forgetHistory.
	^sheet
! !

"---- The grid"!

!SheetGridMorph class methodsFor: 'instance creation'!
on: aSheet app: anApp
	^self new setSheet: aSheet app: anApp
! !

!SheetGridMorph methodsFor: 'initialization'!
setSheet: aSheet app: anApp
	sheet := aSheet.
	app := anApp.
	scroll := 1 @ 1.
	anchor := 1 @ 1.
	cursor := 1 @ 1.
	editing := false
!
sheet
	^sheet
!
sheet: aSheet
	sheet := aSheet.
	self stopEditing.
	self changed
! !

!SheetGridMorph methodsFor: 'geometry'!
headerWidth
	^44
!
rowHeight
	^26
!
xOfColumn: aColumn
	"The left edge of a column on the display, or nil when it is scrolled out of sight to the left."
	| x |
	aColumn < scroll x ifTrue: [^nil].
	x := self left + self headerWidth.
	scroll x to: aColumn - 1 do: [:c | x := x + (sheet widthOf: c)].
	^x
!
yOfRow: aRow
	aRow < scroll y ifTrue: [^nil].
	^self top + self rowHeight + (aRow - scroll y * self rowHeight)
!
rectOf: aPoint
	| x y |
	x := self xOfColumn: aPoint x.
	y := self yOfRow: aPoint y.
	(x isNil or: [y isNil]) ifTrue: [^nil].
	^x @ y extent: (sheet widthOf: aPoint x) @ self rowHeight
!
visibleColumns
	| out x c |
	out := OrderedCollection new.
	x := self left + self headerWidth.
	c := scroll x.
	[x < self right] whileTrue: [out add: c. x := x + (sheet widthOf: c). c := c + 1].
	^out
!
visibleRows
	^scroll y to: scroll y + (self height - self rowHeight // self rowHeight)
!
placeAt: aPoint
	"The cell under aPoint: column @ row, with 0 for a header."
	| column row x |
	row := aPoint y < (self top + self rowHeight) ifTrue: [0] ifFalse: [aPoint y - self top - self rowHeight // self rowHeight + scroll y].
	aPoint x < (self left + self headerWidth) ifTrue: [^0 @ row].
	x := self left + self headerWidth.
	column := scroll x.
	[x + (sheet widthOf: column) <= aPoint x] whileTrue: [x := x + (sheet widthOf: column). column := column + 1].
	^column @ row
!
columnEdgeAt: aPoint
	"The column whose right edge is under aPoint in the header, for resizing it, or nil."
	| x |
	aPoint y >= (self top + self rowHeight) ifTrue: [^nil].
	x := self left + self headerWidth.
	self visibleColumns do: [:c |
		x := x + (sheet widthOf: c).
		(aPoint x - x) abs <= 4 ifTrue: [^c]].
	^nil
!
selection
	"The selected range, as top left and bottom right places."
	^(anchor min: cursor) -> (anchor max: cursor)
!
selectedPlaces
	| range out |
	range := self selection.
	out := OrderedCollection new.
	range key y to: range value y do: [:r | range key x to: range value x do: [:c | out add: c @ r]].
	^out
!
cursor
	^cursor
!
isEditing
	^editing
!
editText
	^editText
! !

!SheetGridMorph methodsFor: 'moving'!
select: aPoint extending: aBoolean
	cursor := (aPoint max: 1 @ 1) min: 702 @ 99999.
	aBoolean ifFalse: [anchor := cursor].
	self reveal: cursor.
	self changed.
	app ifNotNil: [app selectionChanged]
!
move: aPoint extending: aBoolean
	self select: cursor + aPoint extending: aBoolean
!
reveal: aPoint
	"Scrolls so that aPoint is in sight."
	| columns rows |
	aPoint x < scroll x ifTrue: [scroll := aPoint x @ scroll y].
	aPoint y < scroll y ifTrue: [scroll := scroll x @ aPoint y].
	rows := self height - self rowHeight // self rowHeight - 1 max: 1.
	aPoint y >= (scroll y + rows) ifTrue: [scroll := scroll x @ (aPoint y - rows + 1)].
	columns := self visibleColumns.
	[columns size > 1 and: [aPoint x >= (scroll x + columns size - 1)]] whileTrue: [
		scroll := (scroll x + 1) @ scroll y.
		columns := self visibleColumns]
!
scrollBy: aPoint
	scroll := (scroll + aPoint) max: 1 @ 1.
	self changed
! !

!SheetGridMorph methodsFor: 'editing'!
startEditing: aString
	editing := true.
	editText := aString.
	caret := aString size.
	self changed.
	app ifNotNil: [app selectionChanged]
!
stopEditing
	editing := false.
	editText := nil.
	self changed
!
commit
	"Puts the text being edited in the cursor's cell."
	| text |
	editing ifFalse: [^self].
	text := editText.
	self stopEditing.
	text = (sheet sourceAt: cursor) ifTrue: [^self].
	self put: (Dictionary new at: cursor put: text; yourself)
!
put: aDictionary
	sheet change: aDictionary.
	self changed.
	app ifNotNil: [app sheetChanged]
!
insert: aString
	editText := (editText copyFrom: 1 to: caret) , aString , (editText copyFrom: caret + 1 to: editText size).
	caret := caret + aString size.
	self changed.
	app ifNotNil: [app selectionChanged]
!
wantsReference
	"Whether a click now points at a cell for the formula being typed, rather than leaving the cell."
	^editing and: [editText notEmpty and: [editText first = $= and: [caret > 0 and: ['=+-*/^&(,:<>' includes: (editText at: caret)]]]]
!
editKey: anEvent
	| key |
	key := anEvent key.
	key = 'Enter' ifTrue: [self commit. ^self move: 0 @ (anEvent shift ifTrue: [-1] ifFalse: [1]) extending: false].
	key = 'Tab' ifTrue: [self commit. ^self move: (anEvent shift ifTrue: [-1] ifFalse: [1]) @ 0 extending: false].
	key = 'Escape' ifTrue: [^self stopEditing; select: cursor extending: false].
	key = 'Backspace' ifTrue: [caret > 0 ifTrue: [editText := (editText copyFrom: 1 to: caret - 1) , (editText copyFrom: caret + 1 to: editText size). caret := caret - 1]. ^self editChanged].
	key = 'Delete' ifTrue: [caret < editText size ifTrue: [editText := (editText copyFrom: 1 to: caret) , (editText copyFrom: caret + 2 to: editText size)]. ^self editChanged].
	key = 'ArrowLeft' ifTrue: [caret := caret - 1 max: 0. ^self changed].
	key = 'ArrowRight' ifTrue: [caret := caret + 1 min: editText size. ^self changed].
	key = 'Home' ifTrue: [caret := 0. ^self changed].
	key = 'End' ifTrue: [caret := editText size. ^self changed].
	key size = 1 ifTrue: [self insert: key]
!
editChanged
	self changed.
	app ifNotNil: [app selectionChanged]
! !

!SheetGridMorph methodsFor: 'clipboard'!
copySelection
	"Keeps the selected cells' texts by their offset from the selection's top left."
	| origin |
	origin := self selection key.
	clipboard := origin -> Dictionary new.
	self selectedPlaces do: [:place | clipboard value at: place - origin put: (sheet sourceAt: place)].
	app ifNotNil: [app say: 'Copied ' , clipboard value size printString , ' cells.']
!
cutSelection
	self copySelection.
	self clearSelection
!
paste
	"Pastes at the cursor. A formula's relative references move with it, as far as it moved."
	| change |
	clipboard isNil ifTrue: [^self].
	change := Dictionary new.
	clipboard value keysAndValuesDo: [:offset :text | change at: cursor + offset put: (self text: text movedBy: cursor - clipboard key)].
	self put: change
!
text: aString movedBy: aPoint
	| node |
	(aString notEmpty and: [aString first = $=]) ifFalse: [^aString].
	node := [SheetParser parse: aString allButFirst] on: SheetSyntaxError do: [:e | ^aString].
	^(node shiftedBy: aPoint) formula
!
clearSelection
	| change |
	change := Dictionary new.
	self selectedPlaces do: [:place | (sheet sourceAt: place) isEmpty ifFalse: [change at: place put: '']].
	change isEmpty ifFalse: [self put: change]
! !

!SheetGridMorph methodsFor: 'events'!
handlesMouseDown: anEvent
	^true
!
wantsKeyboardFocus
	^true
!
handlesWheel: anEvent
	^true
!
wheel: anEvent
	| rows |
	rows := anEvent delta abs // self rowHeight max: 1.
	anEvent shift
		ifTrue: [self scrollBy: (anEvent delta sign * rows) @ 0]
		ifFalse: [self scrollBy: 0 @ (anEvent delta sign * rows)]
!
mouseDown: anEvent
	| place |
	resizing := self columnEdgeAt: anEvent position.
	resizing ifNotNil: [^self].
	app ifNotNil: [app closeMenu].
	place := self placeAt: anEvent position.
	(place x = 0 or: [place y = 0]) ifTrue: [^self selectHeader: place].
	self wantsReference ifTrue: [^self insert: (Sheet nameOf: place)].
	editing ifTrue: [self commit].
	self select: place extending: anEvent shift.
	dragging := true.
	anEvent isDoubleClick ifTrue: [dragging := false. self startEditing: (sheet sourceAt: cursor)]
!
selectHeader: aPlace
	"A column's header selects the column, a row's the row."
	editing ifTrue: [self commit].
	aPlace y = 0 ifTrue: [aPlace x = 0 ifTrue: [^self]. anchor := aPlace x @ 1. cursor := aPlace x @ 200].
	aPlace x = 0 ifTrue: [anchor := 1 @ aPlace y. cursor := 26 @ aPlace y].
	self changed.
	app ifNotNil: [app selectionChanged]
!
mouseMove: anEvent
	resizing ifNotNil: [:column | | x |
		x := self xOfColumn: column.
		x ifNotNil: [sheet width: anEvent position x - x of: column].
		^self changed].
	dragging == true ifTrue: [| place |
		place := self placeAt: anEvent position.
		(place x > 0 and: [place y > 0 and: [place ~= cursor]]) ifTrue: [
			cursor := place.
			self changed.
			app ifNotNil: [app selectionChanged]]]
!
mouseUp: anEvent
	resizing ifNotNil: [resizing := nil. app ifNotNil: [app sheetChanged]].
	dragging := false
!
keyStroke: anEvent
	| key |
	key := anEvent key.
	anEvent ctrl ifTrue: [^self commandKey: key asLowercase].
	editing ifTrue: [^self editKey: anEvent].
	key = 'ArrowUp' ifTrue: [^self move: 0 @ -1 extending: anEvent shift].
	key = 'ArrowDown' ifTrue: [^self move: 0 @ 1 extending: anEvent shift].
	key = 'ArrowLeft' ifTrue: [^self move: -1 @ 0 extending: anEvent shift].
	key = 'ArrowRight' ifTrue: [^self move: 1 @ 0 extending: anEvent shift].
	key = 'Tab' ifTrue: [^self move: (anEvent shift ifTrue: [-1] ifFalse: [1]) @ 0 extending: false].
	key = 'Enter' ifTrue: [^self startEditing: (sheet sourceAt: cursor)].
	key = 'F2' ifTrue: [^self startEditing: (sheet sourceAt: cursor)].
	key = 'PageDown' ifTrue: [^self move: 0 @ 10 extending: anEvent shift].
	key = 'PageUp' ifTrue: [^self move: 0 @ -10 extending: anEvent shift].
	key = 'Home' ifTrue: [^self select: 1 @ cursor y extending: anEvent shift].
	(key = 'Backspace' or: [key = 'Delete']) ifTrue: [^self clearSelection].
	key = 'Escape' ifTrue: [^self select: cursor extending: false].
	key size = 1 ifTrue: [^self startEditing: key]
!
commandKey: aString
	aString = 'z' ifTrue: [^app ifNotNil: [app undo]].
	aString = 'y' ifTrue: [^app ifNotNil: [app redo]].
	aString = 'c' ifTrue: [^self copySelection].
	aString = 'x' ifTrue: [^self cutSelection].
	aString = 'v' ifTrue: [^self paste].
	aString = 'a' ifTrue: [anchor := 1 @ 1. cursor := sheet extent max: 1 @ 1. self changed. ^app ifNotNil: [app selectionChanged]]
! !

!SheetGridMorph methodsFor: 'drawing'!
drawOn: aCanvas
	| columns rows range referenced |
	columns := self visibleColumns.
	rows := self visibleRows.
	range := self selection.
	referenced := self referencedPlaces.
	aCanvas fillRect: bounds color: Color surface.
	aCanvas clipTo: bounds during: [
		self drawSelection: range on: aCanvas.
		self drawLines: columns rows: rows on: aCanvas.
		rows do: [:r | columns do: [:c | self drawCell: c @ r on: aCanvas]].
		self drawHeaders: columns rows: rows range: range on: aCanvas.
		referenced do: [:place | (self rectOf: place) ifNotNil: [:rect | aCanvas frameRect: (rect insetBy: 1) color: Color orange width: 2]].
		self drawCursorOn: aCanvas]
!
drawSelection: range on: aCanvas
	| a b |
	range key = range value ifTrue: [^self].
	a := self rectOf: (range key max: scroll).
	b := self rectOf: (range value max: scroll).
	(a isNil or: [b isNil]) ifTrue: [^self].
	aCanvas fillRect: (a origin corner: b corner) color: (Color accent alpha: 0.14)
!
drawCell: aPlace on: aCanvas
	| rect value text width x color |
	(cursor = aPlace and: [editing]) ifTrue: [^self].
	value := sheet valueAt: aPlace.
	value isNil ifTrue: [^self].
	rect := self rectOf: aPlace.
	rect isNil ifTrue: [^self].
	text := SheetFormat text: value.
	width := Canvas widthOf: text size: 13.
	color := value isSheetError ifTrue: [Color red] ifFalse: [Color text].
	x := (value isNumber or: [value isSheetError])
		ifTrue: [rect right - 6 - width]
		ifFalse: [(value == true or: [value == false]) ifTrue: [rect center x - (width // 2)] ifFalse: [rect left + 6]].
	(width + 12) <= rect width ifTrue: [^aCanvas drawString: text at: x @ (rect top + 6) size: 13 bold: false color: color].
	value isString ifTrue: [rect := self spill: rect from: aPlace width: width + 12 on: aCanvas].
	aCanvas clipTo: (rect insetBy: 1) during: [aCanvas drawString: text at: x @ (rect top + 6) size: 13 bold: false color: color]
!
spill: aRect from: aPlace width: aNumber on: aCanvas
	"Text too wide for its cell runs on over the empty cells to its right, as in any spreadsheet, hiding their lines."
	| right c |
	right := aRect right.
	c := aPlace x + 1.
	[right - aRect left < aNumber and: [right < self right and: [(sheet valueAt: c @ aPlace y) isNil and: [(cursor = (c @ aPlace y) and: [editing]) not]]]] whileTrue: [
		right := right + (sheet widthOf: c).
		c := c + 1].
	right > aRect right ifTrue: [aCanvas fillRect: ((aRect right + 1) @ (aRect top + 1) corner: (right - 1) @ (aRect bottom - 1)) color: Color surface].
	^aRect origin corner: right @ aRect bottom
!
drawLines: columns rows: rows on: aCanvas
	| x y |
	x := self left + self headerWidth.
	columns do: [:c |
		x := x + (sheet widthOf: c).
		aCanvas line: x @ self top to: x @ self bottom color: Color line width: 1].
	y := self top + self rowHeight.
	rows do: [:r |
		y := y + self rowHeight.
		aCanvas line: self left @ y to: self right @ y color: Color line width: 1]
!
drawHeaders: columns rows: rows range: range on: aCanvas
	| x y |
	aCanvas fillRect: (self topLeft extent: self width @ self rowHeight) color: Color panel.
	aCanvas fillRect: (self topLeft extent: self headerWidth @ self height) color: Color panel.
	x := self left + self headerWidth.
	columns do: [:c | | name w on |
		w := sheet widthOf: c.
		on := c between: range key x and: range value x.
		on ifTrue: [aCanvas fillRect: (x @ self top extent: w @ self rowHeight) color: (Color accent alpha: 0.18)].
		name := Sheet columnName: c.
		aCanvas drawString: name at: (x + (w // 2) - ((Canvas widthOf: name size: 12 bold: on) // 2)) @ (self top + 6) size: 12 bold: on color: Color mutedText.
		x := x + w.
		aCanvas line: x @ self top to: x @ (self top + self rowHeight) color: Color line width: 1].
	y := self top + self rowHeight.
	rows do: [:r | | label on |
		on := r between: range key y and: range value y.
		on ifTrue: [aCanvas fillRect: (self left @ y extent: self headerWidth @ self rowHeight) color: (Color accent alpha: 0.18)].
		label := r printString.
		aCanvas drawString: label at: (self left + self headerWidth - 8 - (Canvas widthOf: label size: 12 bold: on)) @ (y + 6) size: 12 bold: on color: Color mutedText.
		y := y + self rowHeight].
	aCanvas line: (self left + self headerWidth) @ self top to: (self left + self headerWidth) @ self bottom color: Color line width: 1.
	aCanvas line: self left @ (self top + self rowHeight) to: self right @ (self top + self rowHeight) color: Color line width: 1
!
drawCursorOn: aCanvas
	| rect |
	rect := self rectOf: cursor.
	rect isNil ifTrue: [^self].
	editing ifFalse: [^aCanvas frameRect: (rect expandBy: 1) color: Color accent width: 2].
	rect := rect origin extent: ((Canvas widthOf: editText size: 13) + 16 max: rect width) @ rect height.
	aCanvas fillRect: rect color: Color surface.
	aCanvas frameRect: (rect expandBy: 1) color: Color accent width: 2.
	aCanvas drawString: editText at: (rect left + 6) @ (rect top + 6) size: 13 bold: false color: Color text.
	self drawCaretAt: (rect left + 6 + (Canvas widthOf: (editText copyFrom: 1 to: caret) size: 13)) @ (rect top + 4) on: aCanvas
!
drawCaretAt: aPoint on: aCanvas
	aCanvas line: aPoint to: aPoint + (0 @ 18) color: Color text width: 1
!
referencedPlaces
	"While a formula is typed, the cells it reads, so they can be framed."
	| node out |
	(editing and: [editText notEmpty and: [editText first = $=]]) ifFalse: [^#()].
	node := [SheetParser parse: editText allButFirst] on: SheetSyntaxError do: [:e | ^#()].
	out := OrderedCollection new.
	node referencesDo: [:place | out size < 400 ifTrue: [out add: place]].
	^out
!
topLeft
	^bounds origin
! !

"---- A menu"!

!SheetMenuMorph class methodsFor: 'instance creation'!
items: anArray action: aBlock
	^self new setItems: anArray action: aBlock
! !

!SheetMenuMorph methodsFor: 'accessing'!
setItems: anArray action: aBlock
	items := anArray.
	action := aBlock.
	self extent: ((items inject: 120 into: [:w :each | w max: (Canvas widthOf: each size: 13) + 32]) @ (items size * 28 + 8))
!
handlesMouseDown: anEvent
	^true
!
indexAt: aPoint
	| i |
	i := aPoint y - self top - 4 // 28 + 1.
	^(i between: 1 and: items size) ifTrue: [i] ifFalse: [nil]
!
mouseMove: anEvent
	hover := self indexAt: anEvent position.
	self changed
!
mouseUp: anEvent
	| i |
	i := (self containsPoint: anEvent position) ifTrue: [self indexAt: anEvent position] ifFalse: [nil].
	self delete.
	i ifNotNil: [action value: (items at: i)]
!
drawOn: aCanvas
	aCanvas fillRoundRect: (bounds translateBy: 2 @ 3) radius: 8 color: (Color black alpha: 0.15).
	aCanvas fillRoundRect: bounds radius: 8 color: Color surface.
	aCanvas frameRect: bounds color: Color line width: 1.
	items doWithIndex: [:item :i | | y |
		y := self top + 4 + (i - 1 * 28).
		hover = i ifTrue: [aCanvas fillRect: ((self left + 4) @ y extent: (self width - 8) @ 28) color: (Color accent alpha: 0.15)].
		aCanvas drawString: item at: (self left + 16) @ (y + 7) size: 13 bold: false color: Color text]
! !

"---- The window"!

!SheetsApp class methodsFor: 'opening'!
open
	"SheetsApp open"
	"The app fills the World, so it takes the World's place: what was open there closes."
	World removeAllMorphs.
	^World open: self new
!
keptName
	^'sheet'
! !

!SheetsApp methodsFor: 'initialization'!
initialize
	super initialize.
	sheet := self load.
	grid := SheetGridMorph on: sheet app: self.
	self addMorph: grid.
	buttons := OrderedCollection new.
	self button: 'Undo' do: [self undo].
	self button: 'Redo' do: [self redo].
	self button: 'Sum' do: [self insertSum].
	self button: 'Records' do: [self chooseRecords].
	self button: 'Example' do: [self useExample].
	status := StringMorph contents: '' size: 13 bold: false.
	status color: #mutedText.
	self addMorph: status
!
button: aString do: aBlock
	| b |
	b := ButtonMorph label: aString action: aBlock.
	b color: #mutedText.
	buttons add: b.
	self addMorph: b
!
load
	| kept new |
	new := Sheet new.
	kept := [Slip kept: self class keptName] on: Error do: [:e | nil].
	(kept isKindOf: Dictionary) ifTrue: [new state: kept. ^new].
	^Sheet example
! !

!SheetsApp methodsFor: 'layout'!
worldResized: aRect
	self bounds: aRect
!
extentChanged
	| x |
	grid isNil ifTrue: [^self].
	x := self left + 110.
	buttons do: [:b | b position: x @ (self top + 10). x := b right + 8].
	grid bounds: ((self left + 12) @ (self top + 90) corner: (self right - 12) @ (self bottom - 34)).
	status position: (self left + 14) @ (self bottom - 26)
! !

!SheetsApp methodsFor: 'drawing'!
drawOn: aCanvas
	| bar name text |
	aCanvas fillRect: bounds color: Color background.
	aCanvas drawString: 'Sheets' at: (self left + 14) @ (self top + 14) size: 20 bold: true color: Color text.
	bar := (self left + 12) @ (self top + 52) corner: (self right - 12) @ (self top + 82).
	aCanvas fillRoundRect: bar radius: 6 color: Color surface.
	aCanvas frameRect: bar color: Color line width: 1.
	name := Sheet nameOf: grid cursor.
	aCanvas drawString: name at: (bar left + 10) @ (bar top + 7) size: 13 bold: true color: Color accent.
	aCanvas line: (bar left + 64) @ (bar top + 6) to: (bar left + 64) @ (bar bottom - 6) color: Color line width: 1.
	text := grid isEditing ifTrue: [grid editText] ifFalse: [sheet sourceAt: grid cursor].
	aCanvas clipTo: ((bar left + 70) @ bar top corner: (bar right - 6) @ bar bottom) during: [
		aCanvas drawString: text at: (bar left + 76) @ (bar top + 7) size: 13 bold: false color: Color text].
	self drawHintOn: aCanvas below: bar
!
drawHintOn: aCanvas below: bar
	| cell |
	cell := sheet cellAt: grid cursor.
	(cell notNil and: [cell value isSheetError]) ifFalse: [^self].
	aCanvas drawString: cell value code , '  ' , cell value reason at: (self right - 12 - (Canvas widthOf: cell value code , '  ' , cell value reason size: 12)) @ (self bottom - 26) size: 12 bold: false color: Color red
! !

!SheetsApp methodsFor: 'acting'!
sheet
	^sheet
!
grid
	^grid
!
selectionChanged
	"The formula bar and the status line follow the selection."
	self changed.
	self showSelection
!
showSelection
	| places numbers |
	statusUntil notNil ifTrue: [^self].
	places := grid selectedPlaces.
	places size < 2 ifTrue: [^status contents: ''].
	numbers := (places collect: [:p | sheet valueAt: p]) select: [:v | v isNumber].
	numbers isEmpty ifTrue: [^status contents: places size printString , ' cells'].
	status contents: 'Sum ' , (SheetFormat text: (numbers inject: 0 into: [:a :b | a + b])) ,
		'   Average ' , (SheetFormat text: (numbers inject: 0 into: [:a :b | a + b]) / numbers size) ,
		'   Count ' , numbers size printString
!
sheetChanged
	self changed.
	self keep
!
keep
	[Slip keep: sheet state as: self class keptName] on: Error do: [:e | self say: 'Not kept: ' , e messageText]
!
say: aString
	status contents: aString.
	statusUntil := Time millisecondClockValue + 2500
!
undo
	sheet undo ifFalse: [^self say: 'Nothing to undo.'].
	self sheetChanged
!
redo
	sheet redo ifFalse: [^self say: 'Nothing to redo.'].
	self sheetChanged
!
insertSum
	"Sums the numbers above the cursor, as far up as they go."
	| place top |
	place := grid cursor.
	top := place y.
	[top > 1 and: [(sheet valueAt: place x @ (top - 1)) isNumber]] whileTrue: [top := top - 1].
	top = place y ifTrue: [^self say: 'Put the cursor under a column of numbers.'].
	grid put: (Dictionary new at: place put: '=SUM(' , (Sheet nameOf: place x @ top) , ':' , (Sheet nameOf: place x @ (place y - 1)) , ')'; yourself)
!
useExample
	self setSheet: Sheet example
!
setSheet: aSheet
	| change |
	change := Dictionary new.
	sheet places do: [:place | change at: place put: ''].
	aSheet places do: [:place | change at: place put: (aSheet sourceAt: place)].
	grid put: change.
	self say: 'The example is back. Undo puts your sheet back.'
!
chooseRecords
	"A menu of the file's record types; the one chosen is read into the sheet."
	| entities |
	entities := [Nendo entities] on: Error do: [:e | ^self say: 'Cannot read the file: ' , e messageText].
	entities isEmpty ifTrue: [^self say: 'This file has no record types.'].
	menu ifNotNil: [menu delete].
	menu := SheetMenuMorph items: entities action: [:entity | self readRecords: entity].
	menu position: (buttons at: 4) left @ ((buttons at: 4) bottom + 4).
	self addMorph: menu
!
closeMenu
	menu ifNotNil: [menu delete. menu := nil]
!
readRecords: entityId
	| count |
	count := [sheet readRecords: entityId] on: Error do: [:e | ^self say: 'Cannot read ' , entityId , ': ' , e messageText].
	grid sheet: sheet.
	self sheetChanged.
	self say: count printString , ' records of ' , entityId , ' read. Undo puts your sheet back.'
! !

!SheetsApp methodsFor: 'events'!
wantsKeyboardFocus
	^true
!
keyStroke: anEvent
	grid keyStroke: anEvent
!
wantsSteps
	^statusUntil notNil
!
step
	Time millisecondClockValue >= statusUntil ifFalse: [^self].
	statusUntil := nil.
	status contents: ''.
	self showSelection
! !
