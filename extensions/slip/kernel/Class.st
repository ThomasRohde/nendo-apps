"Slip kernel: Behavior, its subclasses and CompiledMethod. Classes are made and changed with the
class definition messages, and methods with compile:classified:."!

!Behavior methodsFor: 'instance creation'!
new
	^self basicNew initialize
!
new: anInteger
	^(self basicNew: anInteger) initialize
!
basicNew
	<primitive: 'basicNew'>
	^self error: self name, ' cannot make instances with new'
!
basicNew: anInteger
	<primitive: 'basicNewSize'>
	^self error: self name, ' cannot make instances with new: ', anInteger printString
! !

!Behavior methodsFor: 'accessing'!
name
	<primitive: 'className'>
	^'a class'
!
superclass
	<primitive: 'superclass'>
	^nil
!
subclasses
	<primitive: 'subclasses'>
	^#()
!
allSubclasses
	| result |
	result := OrderedCollection new.
	self subclasses do: [:each | result add: each; addAll: each allSubclasses].
	^result
!
allSuperclasses
	| result c |
	result := OrderedCollection new.
	c := self superclass.
	[c isNil] whileFalse: [result add: c. c := c superclass].
	^result
!
withAllSuperclasses
	^(OrderedCollection with: self) addAll: self allSuperclasses; yourself
!
selectors
	<primitive: 'selectors'>
	^#()
!
instanceVariableNames
	<primitive: 'instVarNames'>
	^#()
!
instVarNames
	^self instanceVariableNames
!
allInstVarNames
	<primitive: 'allInstVarNames'>
	^#()
!
classVarNames
	<primitive: 'classVarNames'>
	^#()
!
>> aSymbol
	<primitive: 'methodAt'>
	^nil
!
compiledMethodAt: aSymbol
	^(self >> aSymbol) ifNil: [self error: self name, ' has no method #', aSymbol]
!
sourceCodeAt: aSymbol
	^(self compiledMethodAt: aSymbol) sourceCode
!
package
	<primitive: 'packageName'>
	^''
!
category
	^self package
!
comment
	<primitive: 'comment'>
	^''
!
comment: aString
	<primitive: 'commentPut'>
	^self error: 'A comment is a String'
!
instanceClass
	<primitive: 'instanceClass'>
	^self
!
theNonMetaClass
	^self instanceClass
! !

!Behavior methodsFor: 'testing'!
isClass
	^true
!
isMeta
	<primitive: 'isMeta'>
	^false
!
includesSelector: aSymbol
	<primitive: 'includesSelector'>
	^false
!
canUnderstand: aSymbol
	| c |
	c := self.
	[c isNil] whileFalse: [
		(c includesSelector: aSymbol) ifTrue: [^true].
		c := c superclass].
	^false
!
inheritsFrom: aClass
	| c |
	c := self superclass.
	[c isNil] whileFalse: [
		c == aClass ifTrue: [^true].
		c := c superclass].
	^false
!
includesBehavior: aClass
	^self == aClass or: [self inheritsFrom: aClass]
! !

!Behavior methodsFor: 'compiling'!
compile: aString
	^self compile: aString classified: nil
!
compile: aString classified: aProtocol
	<primitive: 'compileClassified'>
	^self error: 'compile: takes the source as a String'
!
removeSelector: aSymbol
	<primitive: 'removeSelector'>
	^false
! !

!Behavior methodsFor: 'printing'!
printOn: aStream
	aStream nextPutAll: self name
! !

!Behavior methodsFor: 'copying'!
shallowCopy
	^self
! !

!Class methodsFor: 'subclass creation'!
defineSubclass: aName shape: aShape instanceVariableNames: instVars classVariableNames: classVars package: aPackage
	<primitive: 'defineSubclass'>
	^self error: 'Cannot define the class ', aName printString
!
subclass: aName
	^self defineSubclass: aName shape: #fixed instanceVariableNames: '' classVariableNames: '' package: 'Unpackaged'
!
subclass: aName instanceVariableNames: instVars classVariableNames: classVars package: aPackage
	^self defineSubclass: aName shape: #fixed instanceVariableNames: instVars classVariableNames: classVars package: aPackage
!
subclass: aName instanceVariableNames: instVars package: aPackage
	^self defineSubclass: aName shape: #fixed instanceVariableNames: instVars classVariableNames: '' package: aPackage
!
subclass: aName instanceVariableNames: instVars classVariableNames: classVars category: aCategory
	^self defineSubclass: aName shape: #fixed instanceVariableNames: instVars classVariableNames: classVars package: aCategory
!
subclass: aName instanceVariableNames: instVars classVariableNames: classVars poolDictionaries: pools category: aCategory
	^self defineSubclass: aName shape: #fixed instanceVariableNames: instVars classVariableNames: classVars package: aCategory
!
variableSubclass: aName instanceVariableNames: instVars classVariableNames: classVars package: aPackage
	^self defineSubclass: aName shape: #variable instanceVariableNames: instVars classVariableNames: classVars package: aPackage
!
variableByteSubclass: aName instanceVariableNames: instVars classVariableNames: classVars package: aPackage
	^self defineSubclass: aName shape: #bytes instanceVariableNames: instVars classVariableNames: classVars package: aPackage
! !

!Metaclass methodsFor: 'accessing'!
soleInstance
	^self instanceClass
! !

!CompiledMethod methodsFor: 'accessing'!
selector
	<primitive: 'methodSelector'>
	^nil
!
sourceCode
	<primitive: 'methodSource'>
	^''
!
methodClass
	<primitive: 'methodClass'>
	^nil
!
protocol
	<primitive: 'methodProtocol'>
	^''
!
numArgs
	<primitive: 'methodNumArgs'>
	^0
! !

!CompiledMethod methodsFor: 'printing'!
printOn: aStream
	aStream print: self methodClass; nextPutAll: '>>'; print: self selector
! !
