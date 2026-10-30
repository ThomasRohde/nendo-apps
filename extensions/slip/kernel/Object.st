"Slip kernel: Object and UndefinedObject. Written for Slip, in Smalltalk-80 style."!

!Object methodsFor: 'class membership'!
class
	<primitive: 'class'>
	^nil
!
isKindOf: aClass
	^self class includesBehavior: aClass
!
isMemberOf: aClass
	^self class == aClass
!
respondsTo: aSymbol
	<primitive: 'respondsTo'>
	^false
! !

!Object methodsFor: 'comparing'!
== anObject
	<primitive: 'identical'>
	^false
!
~~ anObject
	^(self == anObject) not
!
= anObject
	^self == anObject
!
~= anObject
	^(self = anObject) not
!
hash
	^self identityHash
!
identityHash
	<primitive: 'identityHash'>
	^0
! !

!Object methodsFor: 'testing'!
isNil
	^false
!
notNil
	^true
!
isEmptyOrNil
	^false
!
isString
	^false
!
isSymbol
	^false
!
isNumber
	^false
!
isInteger
	^false
!
isFloat
	^false
!
isFraction
	^false
!
isCharacter
	^false
!
isCollection
	^false
!
isArray
	^false
!
isClass
	^false
!
isBlock
	^false
!
isBoolean
	^false
!
isDictionary
	^false
!
isLiteral
	^false
! !

!Object methodsFor: 'nil handling'!
ifNil: aBlock
	^self
!
ifNotNil: aBlock
	^aBlock cull: self
!
ifNil: nilBlock ifNotNil: notNilBlock
	^notNilBlock cull: self
!
ifNotNil: notNilBlock ifNil: nilBlock
	^notNilBlock cull: self
! !

!Object methodsFor: 'copying'!
copy
	^self shallowCopy postCopy
!
shallowCopy
	<primitive: 'shallowCopy'>
	^self
!
postCopy
	^self
!
yourself
	^self
! !

!Object methodsFor: 'initialization'!
initialize
	^self
! !

!Object methodsFor: 'printing'!
printString
	| stream |
	stream := WriteStream on: (String new: 16).
	self printOn: stream.
	^stream contents
!
printOn: aStream
	| title |
	title := self class name.
	aStream
		nextPutAll: (title first isVowel ifTrue: ['an '] ifFalse: ['a ']);
		nextPutAll: title
!
displayString
	^self printString
!
displayOn: aStream
	aStream nextPutAll: self displayString
!
storeString
	^self printString
!
asString
	^self printString
!
basicDescription
	<primitive: 'describe'>
	^'an object'
!
printNl
	Transcript show: self printString; cr
!
displayNl
	Transcript show: self displayString; cr
! !

!Object methodsFor: 'evaluating'!
value
	^self
!
in: aBlock
	^aBlock value: self
!
-> anObject
	^Association key: self value: anObject
! !

!Object methodsFor: 'accessing'!
size
	^self basicSize
!
basicSize
	<primitive: 'basicSize'>
	^0
!
at: index
	<primitive: 'basicAt'>
	^self errorIndex: index
!
at: index put: value
	<primitive: 'basicAtPut'>
	(index isInteger and: [index between: 1 and: self basicSize])
		ifTrue: [^self error: 'Cannot store ', value printString, ' in ', self basicDescription].
	^self errorIndex: index
!
basicAt: index
	<primitive: 'basicAt'>
	^self errorIndex: index
!
basicAt: index put: value
	<primitive: 'basicAtPut'>
	^self errorIndex: index
!
instVarAt: index
	<primitive: 'instVarAt'>
	^self errorSubscriptBounds: index
!
instVarAt: index put: value
	<primitive: 'instVarAtPut'>
	^self errorSubscriptBounds: index
! !

!Object methodsFor: 'message handling'!
perform: aSymbol
	<primitive: 'perform'>
	^self errorPerform: aSymbol arguments: 0
!
perform: aSymbol with: first
	<primitive: 'perform'>
	^self errorPerform: aSymbol arguments: 1
!
perform: aSymbol with: first with: second
	<primitive: 'perform'>
	^self errorPerform: aSymbol arguments: 2
!
perform: aSymbol with: first with: second with: third
	<primitive: 'perform'>
	^self errorPerform: aSymbol arguments: 3
!
perform: aSymbol withArguments: anArray
	<primitive: 'performWithArgs'>
	^self errorPerform: aSymbol arguments: anArray size
!
errorPerform: aSymbol arguments: count
	aSymbol isSymbol ifFalse: [^self error: 'perform: takes a Symbol, not ', aSymbol printString].
	^self error: aSymbol printString, ' takes ', aSymbol numArgs printString, ' argument(s), not ', count printString
!
doesNotUnderstand: aMessage
	^MessageNotUnderstood new
		message: aMessage;
		receiver: self;
		signal: self basicDescription, ' does not understand #', aMessage selector
! !

!Object methodsFor: 'errors'!
error: aString
	^Error new signal: aString
!
halt
	<primitive: 'halt'>
	^self
!
assert: aBlockOrBoolean
	aBlockOrBoolean value ifFalse: [^self error: 'Assertion failed']
!
assert: aBlockOrBoolean description: aString
	aBlockOrBoolean value ifFalse: [^self error: aString]
!
subclassResponsibility
	^self error: 'A subclass of ', self class name, ' should have implemented this method'
!
shouldNotImplement
	^self error: 'This message is not appropriate for ', self basicDescription
!
errorIndex: index
	index isInteger ifFalse: [^self error: 'An index must be an integer, not ', index printString].
	self basicSize = 0 ifTrue: [^self error: 'Instances of ', self class name, ' are not indexable'].
	^self errorSubscriptBounds: index
!
errorSubscriptBounds: index
	^SubscriptOutOfBounds new signal: 'Index ', index printString, ' is out of bounds'
!
errorEmpty
	^self error: 'The collection is empty'
!
errorNotFound: anObject
	^NotFound new signal: anObject printString, ' is not found'
! !

!UndefinedObject methodsFor: 'testing'!
isNil
	^true
!
notNil
	^false
!
isEmptyOrNil
	^true
!
isLiteral
	^true
! !

!UndefinedObject methodsFor: 'nil handling'!
ifNil: aBlock
	^aBlock value
!
ifNotNil: aBlock
	^self
!
ifNil: nilBlock ifNotNil: notNilBlock
	^nilBlock value
!
ifNotNil: notNilBlock ifNil: nilBlock
	^nilBlock value
! !

!UndefinedObject methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: 'nil'
! !

!UndefinedObject methodsFor: 'copying'!
shallowCopy
	^self
! !
