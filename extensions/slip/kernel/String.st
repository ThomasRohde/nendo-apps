"Slip kernel: String and Symbol. A Symbol is a unique, unchangeable String."!

!String class methodsFor: 'instance creation'!
cr
	^self with: Character cr
!
lf
	^self with: Character lf
!
crlf
	^self with: Character cr with: Character lf
!
tab
	^self with: Character tab
!
space
	^self with: Character space
!
streamContents: aBlock
	| stream |
	stream := WriteStream on: (self new: 64).
	aBlock value: stream.
	^stream contents
! !

!String methodsFor: 'testing'!
isString
	^true
!
isLiteral
	^true
!
includesSubstring: aString
	^(self indexOfSubCollection: aString startingAt: 1) > 0
!
beginsWith: aString
	<primitive: 'strBeginsWith'>
	^false
!
endsWith: aString
	<primitive: 'strEndsWith'>
	^false
! !

!String methodsFor: 'comparing'!
= aString
	<primitive: 'strEq'>
	^false
!
compare: aString
	<primitive: 'strCompare'>
	^self error: 'Cannot compare a String with ', aString basicDescription
!
< aString
	^(self compare: aString) < 0
!
> aString
	^(self compare: aString) > 0
!
<= aString
	^(self compare: aString) <= 0
!
>= aString
	^(self compare: aString) >= 0
!
hash
	<primitive: 'strHash'>
	^0
! !

!String methodsFor: 'accessing'!
indexOfSubCollection: aString startingAt: start
	<primitive: 'strIndexOfSub'>
	^0
!
lines
	<primitive: 'strLines'>
	^Array with: self
!
substrings
	<primitive: 'strSubstrings'>
	^Array with: self
!
substrings: separators
	<primitive: 'strSubstrings'>
	^Array with: self
!
subStrings: separators
	^self substrings: separators
! !

!String methodsFor: 'copying'!
, aString
	<primitive: 'strConcat'>
	(aString isKindOf: SequenceableCollection) ifTrue: [^super , aString].
	^self error: 'Cannot append ', aString basicDescription, ' to a String; send it printString or displayString first'
!
copyReplaceAll: oldString with: newString
	<primitive: 'strReplaceAll'>
	^self error: 'copyReplaceAll:with: takes two strings'
!
reversed
	<primitive: 'strReversed'>
	^super reversed
! !

!String methodsFor: 'converting'!
asString
	^self
!
asSymbol
	<primitive: 'strAsSymbol'>
	^nil
!
asUppercase
	<primitive: 'strUpper'>
	^self
!
asLowercase
	<primitive: 'strLower'>
	^self
!
asNumber
	<primitive: 'strAsNumber'>
	^nil
!
asInteger
	| n |
	n := self asNumber.
	^n isNil ifTrue: [nil] ifFalse: [n truncated]
!
trimBoth
	<primitive: 'strTrim'>
	^self
!
trimmed
	^self trimBoth
!
capitalized
	self isEmpty ifTrue: [^self copy].
	^(String with: self first asUppercase), self allButFirst
!
join: aCollection
	^String streamContents: [:stream |
		aCollection do: [:each | stream nextPutAll: each asString] separatedBy: [stream nextPutAll: self]]
! !

!String methodsFor: 'printing'!
printOn: aStream
	aStream nextPut: $'.
	self do: [:c |
		c = $' ifTrue: [aStream nextPut: $'].
		aStream nextPut: c].
	aStream nextPut: $'
!
displayString
	^self copy
!
displayOn: aStream
	aStream nextPutAll: self
! !

!Symbol class methodsFor: 'instance creation'!
new: anInteger
	^self error: 'Symbols are made with asSymbol or #name'
! !

!Symbol methodsFor: 'testing'!
isSymbol
	^true
! !

!Symbol methodsFor: 'comparing'!
= anObject
	^self == anObject
!
hash
	<primitive: 'strHash'>
	^0
! !

!Symbol methodsFor: 'accessing'!
numArgs
	<primitive: 'symbolNumArgs'>
	^0
!
at: index put: anObject
	^self error: 'A Symbol cannot change'
!
species
	^String
! !

!Symbol methodsFor: 'converting'!
asString
	<primitive: 'strAsString'>
	^self
!
asSymbol
	^self
! !

!Symbol methodsFor: 'evaluating'!
value: anObject
	^anObject perform: self
!
value: first value: second
	^first perform: self with: second
!
cull: anObject
	^anObject perform: self
! !

!Symbol methodsFor: 'copying'!
shallowCopy
	^self
! !

!Symbol methodsFor: 'printing'!
printOn: aStream
	aStream nextPut: $#.
	(self isEmpty not and: [
		(self first isLetter and: [self allSatisfy: [:c | c isAlphaNumeric or: [c = $: or: [c = $_]]]])
			or: [self allSatisfy: [:c | '+-*/\<>=~@%|&?,' includes: c]]])
		ifTrue: [aStream nextPutAll: self]
		ifFalse: [super printOn: aStream]
!
displayString
	^self asString
! !
