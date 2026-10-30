"Slip kernel: SequenceableCollection, ArrayedCollection, Array, ByteArray and Interval."!

!SequenceableCollection methodsFor: 'accessing'!
first
	self isEmpty ifTrue: [^self errorEmpty].
	^self at: 1
!
last
	self isEmpty ifTrue: [^self errorEmpty].
	^self at: self size
!
second
	^self at: 2
!
first: n
	^self copyFrom: 1 to: n
!
last: n
	^self copyFrom: self size - n + 1 to: self size
!
allButFirst
	^self copyFrom: 2 to: self size
!
allButLast
	^self copyFrom: 1 to: self size - 1
!
indexOf: anElement
	1 to: self size do: [:i | (self at: i) = anElement ifTrue: [^i]].
	^0
!
swap: i with: j
	| t |
	t := self at: i.
	self at: i put: (self at: j).
	self at: j put: t
!
atRandom
	^self at: self size atRandom
! !

!SequenceableCollection methodsFor: 'enumerating'!
do: aBlock
	1 to: self size do: [:i | aBlock value: (self at: i)]
!
reverseDo: aBlock
	self size to: 1 by: -1 do: [:i | aBlock value: (self at: i)]
!
doWithIndex: aBlock
	1 to: self size do: [:i | aBlock value: (self at: i) value: i]
!
withIndexDo: aBlock
	1 to: self size do: [:i | aBlock value: (self at: i) value: i]
!
keysAndValuesDo: aBlock
	1 to: self size do: [:i | aBlock value: i value: (self at: i)]
!
do: aBlock separatedBy: separatorBlock
	1 to: self size do: [:i |
		i > 1 ifTrue: [separatorBlock value].
		aBlock value: (self at: i)]
!
collect: aBlock
	| result |
	result := self species new: self size.
	1 to: self size do: [:i | result at: i put: (aBlock value: (self at: i))].
	^result
!
withIndexCollect: aBlock
	| result |
	result := self species new: self size.
	1 to: self size do: [:i | result at: i put: (aBlock value: (self at: i) value: i)].
	^result
!
with: aCollection do: aBlock
	aCollection size = self size ifFalse: [^self error: 'The collections are not the same size'].
	1 to: self size do: [:i | aBlock value: (self at: i) value: (aCollection at: i)]
!
with: aCollection collect: aBlock
	| result |
	aCollection size = self size ifFalse: [^self error: 'The collections are not the same size'].
	result := self species new: self size.
	1 to: self size do: [:i | result at: i put: (aBlock value: (self at: i) value: (aCollection at: i))].
	^result
! !

!SequenceableCollection methodsFor: 'copying'!
copyFrom: start to: stop
	| result |
	result := self species new: (stop - start + 1 max: 0).
	start to: stop do: [:i | result at: i - start + 1 put: (self at: i)].
	^result
!
, aCollection
	| result |
	result := self species new: self size + aCollection size.
	1 to: self size do: [:i | result at: i put: (self at: i)].
	1 to: aCollection size do: [:i | result at: self size + i put: (aCollection at: i)].
	^result
!
reversed
	| result n |
	n := self size.
	result := self species new: n.
	1 to: n do: [:i | result at: i put: (self at: n - i + 1)].
	^result
!
reverse
	^self reversed
!
sorted
	^self copy sort
!
sorted: aBlock
	^self copy sort: aBlock
! !

!SequenceableCollection methodsFor: 'sorting'!
sort
	^self sort: [:a :b | a <= b]
!
sort: aBlock
	"A stable merge sort, from the bottom up."
	| n source target width i left right leftEnd rightEnd k swap |
	n := self size.
	n < 2 ifTrue: [^self].
	source := Array new: n.
	1 to: n do: [:j | source at: j put: (self at: j)].
	target := Array new: n.
	width := 1.
	[width < n] whileTrue: [
		i := 1.
		[i <= n] whileTrue: [
			left := i.
			leftEnd := i + width - 1 min: n.
			right := leftEnd + 1.
			rightEnd := i + (2 * width) - 1 min: n.
			k := i.
			[left <= leftEnd and: [right <= rightEnd]] whileTrue: [
				(aBlock value: (source at: left) value: (source at: right))
					ifTrue: [target at: k put: (source at: left). left := left + 1]
					ifFalse: [target at: k put: (source at: right). right := right + 1].
				k := k + 1].
			[left <= leftEnd] whileTrue: [target at: k put: (source at: left). left := left + 1. k := k + 1].
			[right <= rightEnd] whileTrue: [target at: k put: (source at: right). right := right + 1. k := k + 1].
			i := i + (2 * width)].
		swap := source.
		source := target.
		target := swap.
		width := width * 2].
	1 to: n do: [:j | self at: j put: (source at: j)]
! !

!SequenceableCollection methodsFor: 'comparing'!
= aCollection
	self == aCollection ifTrue: [^true].
	self class == aCollection class ifFalse: [^false].
	self size = aCollection size ifFalse: [^false].
	1 to: self size do: [:i | (self at: i) = (aCollection at: i) ifFalse: [^false]].
	^true
!
hash
	| h |
	h := self size.
	self do: [:each | h := (h * 31 + each hash) bitAnd: 16r3FFFFFF].
	^h
! !

!SequenceableCollection methodsFor: 'converting'!
readStream
	^ReadStream on: self
!
writeStream
	^WriteStream on: self
! !

!ArrayedCollection class methodsFor: 'instance creation'!
new
	^self new: 0
!
new: size
	<primitive: 'basicNewSize'>
	^self error: 'Cannot make ', self name, ' new: ', size printString
!
new: size withAll: anObject
	| result |
	result := self new: size.
	1 to: size do: [:i | result at: i put: anObject].
	^result
!
with: anObject
	^(self new: 1) at: 1 put: anObject; yourself
!
with: first with: second
	^(self new: 2) at: 1 put: first; at: 2 put: second; yourself
!
with: first with: second with: third
	^(self new: 3) at: 1 put: first; at: 2 put: second; at: 3 put: third; yourself
!
with: first with: second with: third with: fourth
	^(self new: 4) at: 1 put: first; at: 2 put: second; at: 3 put: third; at: 4 put: fourth; yourself
!
withAll: aCollection
	| result i |
	result := self new: aCollection size.
	i := 0.
	aCollection do: [:each | result at: (i := i + 1) put: each].
	^result
! !

!ArrayedCollection methodsFor: 'accessing'!
size
	<primitive: 'basicSize'>
	^0
!
add: anObject
	^self error: 'A ', self class name, ' cannot grow; use an OrderedCollection'
! !

!ArrayedCollection methodsFor: 'copying'!
replaceFrom: start to: stop with: replacement startingAt: repStart
	<primitive: 'replaceFromToWithStartingAt'>
	start to: stop do: [:i | self at: i put: (replacement at: repStart - start + i)]
!
replaceFrom: start to: stop with: replacement
	^self replaceFrom: start to: stop with: replacement startingAt: 1
!
copyFrom: start to: stop
	| result |
	stop < start ifTrue: [^self species new: 0].
	(start < 1 or: [stop > self size]) ifTrue: [^self errorSubscriptBounds: (start < 1 ifTrue: [start] ifFalse: [stop])].
	result := self species new: stop - start + 1.
	^result replaceFrom: 1 to: result size with: self startingAt: start
!
, aCollection
	| result |
	result := self species new: self size + aCollection size.
	result replaceFrom: 1 to: self size with: self startingAt: 1.
	result replaceFrom: self size + 1 to: result size with: aCollection asArray startingAt: 1.
	^result
!
copyWith: anObject
	| result |
	result := self species new: self size + 1.
	result replaceFrom: 1 to: self size with: self startingAt: 1.
	result at: result size put: anObject.
	^result
! !

!ArrayedCollection methodsFor: 'enumerating'!
select: aBlock
	| stream |
	stream := WriteStream on: (self species new: 8).
	self do: [:each | (aBlock value: each) ifTrue: [stream nextPut: each]].
	^stream contents
! !

!Array methodsFor: 'testing'!
isArray
	^true
!
isLiteral
	^self allSatisfy: [:each | each isLiteral]
! !

!Array methodsFor: 'converting'!
asArray
	^self
! !

!Array methodsFor: 'printing'!
printOn: aStream
	self isLiteral
		ifTrue: [
			aStream nextPutAll: '#('.
			self do: [:each | aStream print: each] separatedBy: [aStream space].
			aStream nextPut: $)]
		ifFalse: [
			aStream nextPut: ${.
			self do: [:each | aStream print: each] separatedBy: [aStream nextPutAll: '. '].
			aStream nextPut: $}]
! !

!ByteArray methodsFor: 'testing'!
isLiteral
	^true
! !

!ByteArray methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: '#['.
	self do: [:each | aStream print: each] separatedBy: [aStream space].
	aStream nextPut: $]
! !

!Interval class methodsFor: 'instance creation'!
from: start to: stop
	^self basicNew setFrom: start to: stop by: 1
!
from: start to: stop by: step
	step = 0 ifTrue: [^self error: 'The step must not be zero'].
	^self basicNew setFrom: start to: stop by: step
! !

!Interval methodsFor: 'private'!
setFrom: aStart to: aStop by: aStep
	start := aStart.
	stop := aStop.
	step := aStep
! !

!Interval methodsFor: 'accessing'!
first
	^start
!
last
	^stop - ((stop - start) \\ step)
!
increment
	^step
!
size
	step > 0
		ifTrue: [stop < start ifTrue: [^0]]
		ifFalse: [start < stop ifTrue: [^0]].
	^(stop - start) // step + 1
!
at: index
	(index isInteger and: [index between: 1 and: self size]) ifFalse: [^self errorSubscriptBounds: index].
	^start + (step * (index - 1))
!
at: index put: anObject
	^self error: 'An Interval cannot change'
!
species
	^Array
!
add: anObject
	^self error: 'An Interval cannot grow'
! !

!Interval methodsFor: 'enumerating'!
do: aBlock
	| v |
	v := start.
	step > 0
		ifTrue: [[v <= stop] whileTrue: [aBlock value: v. v := v + step]]
		ifFalse: [[v >= stop] whileTrue: [aBlock value: v. v := v + step]]
!
select: aBlock
	^self asArray select: aBlock
! !

!Interval methodsFor: 'comparing'!
= anObject
	^(anObject isKindOf: Interval)
		ifTrue: [start = anObject first and: [step = anObject increment and: [self size = anObject size]]]
		ifFalse: [super = anObject]
! !

!Interval methodsFor: 'printing'!
printOn: aStream
	aStream nextPut: $(; print: start; nextPutAll: ' to: '; print: stop.
	step = 1 ifFalse: [aStream nextPutAll: ' by: '; print: step].
	aStream nextPut: $)
! !
